import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {AuthMethod} from '@plunk/db';

import {SENDGRID_EVENT_WEBHOOK_PRIVATE_KEY, SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY} from './keypair';
import {MockSendGridServer, type SendGridMailSendRequest} from './mock-server';

process.env.NODE_ENV = 'test';
process.env.PLUNK_SKIP_LISTEN = 'true';
process.env.JWT_SECRET = 'sendgrid-ci-tests';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/postgres';
process.env.API_URI = 'http://localhost:8080';
process.env.DASHBOARD_URI = 'http://localhost:3000';
process.env.DISABLE_SIGNUPS = 'false';
process.env.EMAIL_PROVIDER = 'sendgrid';
process.env.SENDGRID_API_KEY = 'SG.ci-test-key';
process.env.SENDGRID_REGION = 'global';
process.env.SENDGRID_DOMAIN_AUTH_SUBDOMAIN = 'mail';
process.env.SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY = 'true';
process.env.SENDGRID_DOMAIN_AUTH_DEFAULT = 'false';
process.env.SENDGRID_TRACKING_ENABLED = 'true';
process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY = SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY;
process.env.SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED = 'true';
process.env.SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = '300';

await import('../../apps/api/src/app');
const app = process.env.API_URI;
const {prisma} = await import('../../apps/api/src/database/prisma');
const {redis} = await import('../../apps/api/src/database/redis');
const {EmailService} = await import('../../apps/api/src/services/EmailService');

type SendGridWebhookEvent = {
	event: string;
	timestamp: number;
	sg_event_id: string;
	sg_message_id?: string;
	email: string;
	url?: string;
	reason?: string;
	custom_args?: {
		plunk_email_id?: string;
	};
};

type SentEmail = {
	emailId: string;
	contactId: string;
	contactEmail: string;
	messageId: string;
};

const truncateTables = [
	'provider_webhook_events',
	'emails',
	'campaigns',
	'events',
	'templates',
	'contacts',
	'domains',
	'memberships',
	'projects',
	'users',
];

function signWebhookPayload(payload: string, timestamp: number): string {
	const signer = crypto.createSign('sha256');
	signer.update(String(timestamp));
	signer.update(payload);
	signer.end();
	return signer.sign(SENDGRID_EVENT_WEBHOOK_PRIVATE_KEY).toString('base64');
}

async function postSignedWebhook(events: SendGridWebhookEvent[]) {
	const timestamp = Math.floor(Date.now() / 1000);
	const payload = JSON.stringify(events);
	return await request(app)
		.post('/webhooks/sendgrid/events')
		.set('Content-Type', 'application/json')
		.set('X-Twilio-Email-Event-Webhook-Timestamp', String(timestamp))
		.set('X-Twilio-Email-Event-Webhook-Signature', signWebhookPayload(payload, timestamp))
		.send(payload);
}

async function createProject() {
	const user = await prisma.user.create({data: {email: 'owner@example.com', emailVerified: true, type: AuthMethod.OIDC}});
	const project = await prisma.project.create({
		data: {
			name: 'SendGrid CI',
			public: `pk_${crypto.randomUUID()}`,
			secret: `sk_${crypto.randomUUID()}`,
			members: {create: {userId: user.id, role: 'OWNER'}},
		},
	});

	return {project: project as {id: string; secret: string; public: string}};
}

async function sendTransactionalEmail(projectSecret: string, recipient: string): Promise<SentEmail> {
	const send = await request(app)
		.post('/v1/send')
		.set('Authorization', `Bearer ${projectSecret}`)
		.send({
			from: 'sender@example.com',
			name: 'Sender Name',
			reply: 'reply@example.com',
			to: recipient,
			subject: 'Welcome {{plan}}',
			body: '<p>Hello {{plunk_email}} on {{plan}}</p>',
			subscribed: true,
			headers: {'X-Campaign': 'ci'},
			attachments: [
				{filename: 'hello.txt', content: Buffer.from('hello').toString('base64'), contentType: 'text/plain'},
			],
		})
		.expect(200);

	expect(send.body.success).toBe(true);
	const emailId = send.body.data.emails[0].email as string;
	await EmailService.sendEmail(emailId);
	const sent = await prisma.email.findUniqueOrThrow({where: {id: emailId}, include: {contact: true}});
	expect(sent.status).toBe('SENT');
	expect(sent.contact.subscribed).toBe(true);

	return {emailId, contactId: sent.contactId, contactEmail: sent.contact.email, messageId: sent.messageId};
}

function eventForEmail(sentEmail: SentEmail, event: string, index: number, extras: Partial<SendGridWebhookEvent> = {}) {
	return {
		event,
		timestamp: 1_800_000_000 + index,
		sg_event_id: `evt-${event}-${index}`,
		sg_message_id: sentEmail.messageId,
		email: sentEmail.contactEmail,
		custom_args: {plunk_email_id: sentEmail.emailId},
		...extras,
	};
}

function assertTrackingSettings(mailSend: SendGridMailSendRequest, enabled: boolean): void {
	expect(mailSend.trackingSettings).toEqual({
		openTracking: {enable: enabled},
		clickTracking: {enable: enabled, enableText: enabled},
	});
}

describe('SendGrid parity E2E', () => {
	let sendGrid: MockSendGridServer | null = null;
	let databaseReady = false;
	let redisReady = false;

	beforeAll(async () => {
		sendGrid = new MockSendGridServer();
		process.env.SENDGRID_API_BASE_URL = await sendGrid.start();
		execFileSync('yarn', ['workspace', '@plunk/db', 'migrate:prod'], {stdio: 'inherit', env: process.env});
		await prisma.$connect();
		databaseReady = true;
		await redis.ping();
		redisReady = true;
	});

	afterAll(async () => {
		try {
			if (databaseReady) {
				await prisma.$executeRawUnsafe(
					`TRUNCATE TABLE ${truncateTables.map(table => `\"${table}\"`).join(', ')} RESTART IDENTITY CASCADE`,
				);
			}
		} finally {
			await Promise.allSettled([
				redisReady ? redis.quit() : Promise.resolve(),
				databaseReady ? prisma.$disconnect() : Promise.resolve(),
				sendGrid ? sendGrid.stop() : Promise.resolve(),
			]);
		}
	});

	it('onboards a SendGrid domain, sends email, and processes signed webhook events idempotently', async () => {
		const {project} = await createProject();

		const identity = await request(app)
			.post('/domains')
			.set('Authorization', `Bearer ${project.secret}`)
			.send({projectId: project.id, domain: 'example.com'})
			.expect(201);

		expect(identity.body).toMatchObject({provider: 'SENDGRID', dkimTokens: []});
		expect(identity.body.providerRecords).toEqual([
			{type: 'CNAME', host: 'mail.example.com', value: 'sendgrid.net'},
			{type: 'CNAME', host: 's1._domainkey.example.com', value: 's1.domainkey.u123456.wl.sendgrid.net'},
			{type: 'CNAME', host: 's2._domainkey.example.com', value: 's2.domainkey.u123456.wl.sendgrid.net'},
		]);
		expect(sendGrid?.domainAuthRequests).toEqual([
			{domain: 'example.com', subdomain: 'mail', automatic_security: true, default: false},
		]);

		const storedDomain = await prisma.domain.findFirstOrThrow({where: {projectId: project.id}});
		expect(storedDomain.provider).toBe('SENDGRID');
		expect(storedDomain.providerDomainId).toBe('1000');
		expect(storedDomain.verified).toBe(false);
		expect(storedDomain.providerRecords).toEqual(identity.body.providerRecords);

		await request(app).get(`/domains/${storedDomain.id}/verify`).set('Authorization', `Bearer ${project.secret}`).expect(200);
		expect(sendGrid?.validateRequests).toEqual(['1000']);

		expect((await prisma.domain.findUniqueOrThrow({where: {id: storedDomain.id}})).verified).toBe(true);

		const deliveredEmail = await sendTransactionalEmail(project.secret, 'delivered@example.net');
		const openedEmail = await sendTransactionalEmail(project.secret, 'opened@example.net');
		const clickedEmail = await sendTransactionalEmail(project.secret, 'clicked@example.net');
		const bouncedEmail = await sendTransactionalEmail(project.secret, 'bounced@example.net');
		const complainedEmail = await sendTransactionalEmail(project.secret, 'complained@example.net');
		const unsubscribedEmail = await sendTransactionalEmail(project.secret, 'unsubscribed@example.net');
		const groupUnsubscribedEmail = await sendTransactionalEmail(project.secret, 'group-unsubscribed@example.net');
	
		expect(sendGrid?.mailSendRequests).toHaveLength(7);
		const mailSend = sendGrid?.mailSendRequests[0];
		expect(mailSend).toBeDefined();
		expect(mailSend?.from).toEqual({email: 'sender@example.com', name: 'Sender Name'});
		expect(mailSend?.replyTo).toEqual({email: 'reply@example.com'});
		expect(mailSend?.to).toEqual([{email: 'delivered@example.net'}]);
		expect(mailSend?.customArgs).toMatchObject({plunk_email_id: deliveredEmail.emailId});
		expect(mailSend?.headers).toMatchObject({'X-Campaign': 'ci'});
		expect(mailSend?.subject).toBe('Welcome ');
		expect(mailSend?.html).toContain('delivered@example.net');
		expect(mailSend?.attachments).toEqual([
			{
				filename: 'hello.txt',
				type: 'text/plain',
				content: Buffer.from('hello').toString('base64'),
				disposition: 'attachment',
			},
		]);
		assertTrackingSettings(mailSend as SendGridMailSendRequest, true);

		const webhookEvents = [
			eventForEmail(deliveredEmail, 'delivered', 1),
			eventForEmail(openedEmail, 'open', 2),
			eventForEmail(clickedEmail, 'open', 3),
			eventForEmail(clickedEmail, 'click', 4, {url: 'https://example.com/pricing?utm=ci'}),
			eventForEmail(clickedEmail, 'open', 5),
			eventForEmail(bouncedEmail, 'bounce', 6, {reason: '550 hard bounce'}),
			eventForEmail(complainedEmail, 'spamreport', 7),
			eventForEmail(unsubscribedEmail, 'unsubscribe', 8),
			eventForEmail(groupUnsubscribedEmail, 'group_unsubscribe', 9),
		];

		const webhook = await postSignedWebhook(webhookEvents);
		expect(webhook.status).toBe(200);
		expect(webhook.body).toEqual({success: true, processed: 9, duplicate: 0, failed: 0});

		await expect(prisma.email.findUniqueOrThrow({where: {id: deliveredEmail.emailId}})).resolves.toMatchObject({
			status: 'DELIVERED',
		});
		await expect(prisma.email.findUniqueOrThrow({where: {id: openedEmail.emailId}})).resolves.toMatchObject({
			status: 'OPENED',
		});

		const clicked = await prisma.email.findUniqueOrThrow({where: {id: clickedEmail.emailId}});
		expect(clicked.status).toBe('CLICKED');
		expect(clicked.clicks).toBe(1);

		const bounced = await prisma.email.findUniqueOrThrow({
			where: {id: bouncedEmail.emailId},
			include: {contact: true},
		});
		expect(bounced.status).toBe('BOUNCED');
		expect(bounced.contact.subscribed).toBe(false);

		const complained = await prisma.email.findUniqueOrThrow({
			where: {id: complainedEmail.emailId},
			include: {contact: true},
		});
		expect(complained.status).toBe('COMPLAINED');
		expect(complained.contact.subscribed).toBe(false);

		const unsubscribed = await prisma.email.findUniqueOrThrow({
			where: {id: unsubscribedEmail.emailId},
			include: {contact: true},
		});
		expect(unsubscribed.status).toBe('SENT');
		expect(unsubscribed.contact.subscribed).toBe(false);

		const groupUnsubscribed = await prisma.email.findUniqueOrThrow({
			where: {id: groupUnsubscribedEmail.emailId},
			include: {contact: true},
		});
		expect(groupUnsubscribed.status).toBe('SENT');
		expect(groupUnsubscribed.contact.subscribed).toBe(false);


		expect(await prisma.providerWebhookEvent.count({where: {provider: 'SENDGRID'}})).toBe(9);
		await expect(
			prisma.event.findMany({
				where: {projectId: project.id, name: {in: [
					'email.bounced',
					'email.clicked',
					'email.complained',
					'email.delivered',
					'email.opened',
					'email.unsubscribed',
				]}},
				distinct: ['name'],
				orderBy: {name: 'asc'},
				select: {name: true},
			}),
		).resolves.toEqual([
			{name: 'email.bounced'},
			{name: 'email.clicked'},
			{name: 'email.complained'},
			{name: 'email.delivered'},
			{name: 'email.opened'},
			{name: 'email.unsubscribed'},
		]);

		const replay = await postSignedWebhook(webhookEvents);
		expect(replay.status).toBe(200);
		expect(replay.body).toEqual({success: true, processed: 0, duplicate: 9, failed: 0});
		expect(await prisma.providerWebhookEvent.count({where: {provider: 'SENDGRID'}})).toBe(9);
		expect((await prisma.email.findUniqueOrThrow({where: {id: clickedEmail.emailId}})).clicks).toBe(1);

	});
});
