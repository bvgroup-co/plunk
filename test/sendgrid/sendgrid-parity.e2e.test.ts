import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENDGRID_EVENT_WEBHOOK_PRIVATE_KEY, SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY } from "./keypair";
import { MockSendGridServer, type SendGridMailSendRequest } from "./mock-server";

process.env.NODE_ENV = "development";
process.env.PLUNK_SKIP_LISTEN = "true";
process.env.JWT_SECRET = "sendgrid-ci-tests";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:56379";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55432/postgres";
process.env.API_URI = "http://localhost:4000";
process.env.APP_URI = "http://localhost:3000";
process.env.DISABLE_SIGNUPS = "false";
process.env.EMAIL_PROVIDER = "sendgrid";
process.env.SENDGRID_API_KEY = "SG.ci-test-key";
process.env.SENDGRID_REGION = "global";
process.env.SENDGRID_DOMAIN_AUTH_SUBDOMAIN = "mail";
process.env.SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY = "true";
process.env.SENDGRID_DOMAIN_AUTH_DEFAULT = "false";
process.env.SENDGRID_TRACKING_ENABLED = "true";
process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY = SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY;
process.env.SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED = "true";
process.env.SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = "300";

const { app } = await import("../../packages/api/src/app");
const { prisma } = await import("../../packages/api/src/database/prisma");
const { redis } = await import("../../packages/api/src/services/redis");
const { EmailService } = await import("../../packages/api/src/services/EmailService");

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
	"provider_webhook_events",
	"clicks",
	"triggers",
	"emails",
	"tasks",
	"campaigns",
	"actions",
	"events",
	"templates",
	"contacts",
	"domains",
	"projectmemberhips",
	"projects",
	"users",
];

function signWebhookPayload(payload: string, timestamp: number): string {
	const signer = crypto.createSign("sha256");
	signer.update(String(timestamp));
	signer.update(payload);
	signer.end();
	return signer.sign(SENDGRID_EVENT_WEBHOOK_PRIVATE_KEY).toString("base64");
}

async function postSignedWebhook(events: SendGridWebhookEvent[]) {
	const timestamp = Math.floor(Date.now() / 1000);
	const payload = JSON.stringify(events);
	return await request(app)
		.post("/webhooks/sendgrid/events")
		.set("Content-Type", "application/json")
		.set("X-Twilio-Email-Event-Webhook-Timestamp", String(timestamp))
		.set("X-Twilio-Email-Event-Webhook-Signature", signWebhookPayload(payload, timestamp))
		.send(payload);
}

async function createProject() {
	const signup = await request(app)
		.post("/auth/signup")
		.send({ email: "owner@example.com", password: "password123" })
		.expect(200);

	expect(signup.body.success).toBe(true);
	const cookie = signup.headers["set-cookie"];

	const created = await request(app)
		.post("/projects/create")
		.set("Cookie", cookie)
		.send({ name: "SendGrid CI", url: "example.com" })
		.expect(200);

	expect(created.body.success).toBe(true);
	return { cookie, project: created.body.data as { id: string; secret: string; public: string } };
}

async function sendTransactionalEmail(projectSecret: string, recipient: string): Promise<SentEmail> {
	const send = await request(app)
		.post("/v1/send")
		.set("Authorization", `Bearer ${projectSecret}`)
		.send({
			from: "sender@example.com",
			name: "Sender Name",
			reply: "reply@example.com",
			to: recipient,
			subject: "Welcome {{plan}}",
			body: "<p>Hello {{plunk_email}} on {{plan}}</p>",
			subscribed: true,
			headers: { "X-Campaign": "ci" },
			attachments: [
				{ filename: "hello.txt", content: Buffer.from("hello").toString("base64"), contentType: "text/plain" },
			],
		})
		.expect(200);

	expect(send.body.success).toBe(true);
	const emailId = send.body.emails[0].email as string;
	const email = await prisma.email.findUniqueOrThrow({ where: { id: emailId }, include: { contact: true } });
	expect(email.status).toBe("SENT");
	expect(email.contact.subscribed).toBe(true);

	return { emailId, contactId: email.contactId, contactEmail: email.contact.email, messageId: email.messageId };
}

function eventForEmail(sentEmail: SentEmail, event: string, index: number, extras: Partial<SendGridWebhookEvent> = {}) {
	return {
		event,
		timestamp: 1_800_000_000 + index,
		sg_event_id: `evt-${event}-${index}`,
		sg_message_id: sentEmail.messageId,
		email: sentEmail.contactEmail,
		custom_args: { plunk_email_id: sentEmail.emailId },
		...extras,
	};
}

function assertTrackingSettings(mailSend: SendGridMailSendRequest, enabled: boolean): void {
	expect(mailSend.tracking_settings).toEqual({
		open_tracking: { enable: enabled },
		click_tracking: { enable: enabled, enable_text: enabled },
	});
}

describe("SendGrid parity E2E", () => {
	let sendGrid: MockSendGridServer | null = null;
	let databaseReady = false;
	let redisReady = false;

	beforeAll(async () => {
		sendGrid = new MockSendGridServer();
		process.env.SENDGRID_API_BASE_URL = await sendGrid.start();
		execFileSync("yarn", ["migrate:deploy"], { stdio: "inherit", env: process.env });
		await prisma.$connect();
		databaseReady = true;
		await redis.ping();
		redisReady = true;
	});

	afterAll(async () => {
		try {
			if (databaseReady) {
				await prisma.$executeRawUnsafe(
					`TRUNCATE TABLE ${truncateTables.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
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

	it("onboards a SendGrid domain, sends email, and processes signed webhook events idempotently", async () => {
		const { cookie, project } = await createProject();

		const identity = await request(app)
			.post("/identities/create")
			.set("Cookie", cookie)
			.send({ id: project.id, email: "sender@example.com" })
			.expect(200);

		expect(identity.body).toMatchObject({ success: true, provider: "sendgrid", tokens: [] });
		expect(identity.body.records).toEqual([
			{ type: "CNAME", host: "mail.example.com", value: "sendgrid.net" },
			{ type: "CNAME", host: "s1._domainkey.example.com", value: "s1.domainkey.u123456.wl.sendgrid.net" },
			{ type: "CNAME", host: "s2._domainkey.example.com", value: "s2.domainkey.u123456.wl.sendgrid.net" },
		]);
		expect(sendGrid?.domainAuthRequests).toEqual([
			{ domain: "example.com", subdomain: "mail", automatic_security: true, default: false },
		]);

		const storedDomain = await prisma.domain.findFirstOrThrow({ where: { projectId: project.id } });
		expect(storedDomain.provider).toBe("SENDGRID");
		expect(storedDomain.providerDomainId).toBe("1000");
		expect(storedDomain.verified).toBe(false);
		expect(storedDomain.providerRecords).toEqual(identity.body.records);

		await request(app).post("/identities/update").expect(200);
		expect(sendGrid?.validateRequests).toEqual(["1000"]);

		const verifiedProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
		expect(verifiedProject.verified).toBe(true);
		expect((await prisma.domain.findUniqueOrThrow({ where: { id: storedDomain.id } })).verified).toBe(true);

		const deliveredEmail = await sendTransactionalEmail(project.secret, "delivered@example.net");
		const openedEmail = await sendTransactionalEmail(project.secret, "opened@example.net");
		const clickedEmail = await sendTransactionalEmail(project.secret, "clicked@example.net");
		const bouncedEmail = await sendTransactionalEmail(project.secret, "bounced@example.net");
		const complainedEmail = await sendTransactionalEmail(project.secret, "complained@example.net");
		const unsubscribedEmail = await sendTransactionalEmail(project.secret, "unsubscribed@example.net");
		const groupUnsubscribedEmail = await sendTransactionalEmail(project.secret, "group-unsubscribed@example.net");
		const droppedEmail = await sendTransactionalEmail(project.secret, "dropped@example.net");

		expect(sendGrid?.mailSendRequests).toHaveLength(8);
		const mailSend = sendGrid?.mailSendRequests[0];
		expect(mailSend).toBeDefined();
		expect(mailSend?.from).toEqual({ email: "sender@example.com", name: "Sender Name" });
		expect(mailSend?.reply_to).toEqual({ email: "reply@example.com" });
		expect(mailSend?.personalizations[0]).toMatchObject({
			to: [{ email: "delivered@example.net" }],
			custom_args: { plunk_email_id: deliveredEmail.emailId },
			headers: { "X-Campaign": "ci" },
		});
		expect(mailSend?.subject).toBe("Welcome ");
		expect(mailSend?.content[0]).toMatchObject({ type: "text/html" });
		expect(mailSend?.content[0].value).toContain("delivered@example.net");
		expect(mailSend?.attachments).toEqual([
			{
				filename: "hello.txt",
				type: "text/plain",
				content: Buffer.from("hello").toString("base64"),
				disposition: "attachment",
			},
		]);
		assertTrackingSettings(mailSend as SendGridMailSendRequest, true);

		process.env.SENDGRID_TRACKING_ENABLED = "false";
		const trackingDisabledResponse = await EmailService.send({
			from: { name: "Sender Name", email: "sender@example.com" },
			reply: "reply@example.com",
			to: ["tracking-disabled@example.net"],
			headers: { "X-Plunk-Email-ID": crypto.randomUUID() },
			tracking: false,
			content: { subject: "Tracking disabled", html: "<p>Tracking disabled</p>" },
		});
		expect(trackingDisabledResponse.messageId).toBe("sg-message-9");
		assertTrackingSettings(sendGrid?.mailSendRequests[8] as SendGridMailSendRequest, false);
		process.env.SENDGRID_TRACKING_ENABLED = "true";

		const webhookEvents = [
			eventForEmail(deliveredEmail, "delivered", 1),
			eventForEmail(openedEmail, "open", 2),
			eventForEmail(clickedEmail, "open", 3),
			eventForEmail(clickedEmail, "click", 4, { url: "https://example.com/pricing?utm=ci" }),
			eventForEmail(clickedEmail, "open", 5),
			eventForEmail(bouncedEmail, "bounce", 6, { reason: "550 hard bounce" }),
			eventForEmail(complainedEmail, "spamreport", 7),
			eventForEmail(unsubscribedEmail, "unsubscribe", 8),
			eventForEmail(groupUnsubscribedEmail, "group_unsubscribe", 9),
			eventForEmail(droppedEmail, "dropped", 10, { reason: "blocked" }),
		];

		const webhook = await postSignedWebhook(webhookEvents);
		expect(webhook.status).toBe(200);
		expect(webhook.body).toEqual({ success: true, processed: 10, duplicate: 0, failed: 0 });

		await expect(prisma.email.findUniqueOrThrow({ where: { id: deliveredEmail.emailId } })).resolves.toMatchObject({
			status: "DELIVERED",
		});
		await expect(prisma.email.findUniqueOrThrow({ where: { id: openedEmail.emailId } })).resolves.toMatchObject({
			status: "OPENED",
		});

		const clicked = await prisma.email.findUniqueOrThrow({
			where: { id: clickedEmail.emailId },
			include: { clicks: true },
		});
		expect(clicked.status).toBe("CLICKED");
		expect(clicked.clicks).toHaveLength(1);
		expect(clicked.clicks[0].link).toBe("https://example.com/pricing?utm=ci");

		const bounced = await prisma.email.findUniqueOrThrow({
			where: { id: bouncedEmail.emailId },
			include: { contact: true },
		});
		expect(bounced.status).toBe("BOUNCED");
		expect(bounced.contact.subscribed).toBe(false);

		const complained = await prisma.email.findUniqueOrThrow({
			where: { id: complainedEmail.emailId },
			include: { contact: true },
		});
		expect(complained.status).toBe("COMPLAINED");
		expect(complained.contact.subscribed).toBe(false);

		const unsubscribed = await prisma.email.findUniqueOrThrow({
			where: { id: unsubscribedEmail.emailId },
			include: { contact: true },
		});
		expect(unsubscribed.status).toBe("SENT");
		expect(unsubscribed.contact.subscribed).toBe(false);

		const groupUnsubscribed = await prisma.email.findUniqueOrThrow({
			where: { id: groupUnsubscribedEmail.emailId },
			include: { contact: true },
		});
		expect(groupUnsubscribed.status).toBe("SENT");
		expect(groupUnsubscribed.contact.subscribed).toBe(false);

		await expect(prisma.email.findUniqueOrThrow({ where: { id: droppedEmail.emailId } })).resolves.toMatchObject({
			status: "FAILED",
		});

		expect(await prisma.providerWebhookEvent.count({ where: { provider: "SENDGRID" } })).toBe(10);
		expect(await prisma.trigger.count()).toBe(10);
		await expect(
			prisma.event.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" }, select: { name: true } }),
		).resolves.toEqual([
			{ name: "email.bounced" },
			{ name: "email.clicked" },
			{ name: "email.complained" },
			{ name: "email.delivered" },
			{ name: "email.failed" },
			{ name: "email.opened" },
			{ name: "email.unsubscribed" },
		]);

		const replay = await postSignedWebhook(webhookEvents);
		expect(replay.status).toBe(200);
		expect(replay.body).toEqual({ success: true, processed: 0, duplicate: 10, failed: 0 });
		expect(await prisma.providerWebhookEvent.count({ where: { provider: "SENDGRID" } })).toBe(10);
		expect(await prisma.trigger.count()).toBe(10);
		expect(await prisma.click.count({ where: { emailId: clickedEmail.emailId } })).toBe(1);

		await request(app).post("/identities/reset").set("Cookie", cookie).send({ id: project.id }).expect(200);
		expect(sendGrid?.deleteRequests).toEqual(["1000"]);
		expect(await prisma.domain.count({ where: { projectId: project.id } })).toBe(0);
		expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).email).toBeNull();
	});
});
