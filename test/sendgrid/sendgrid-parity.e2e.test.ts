import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SENDGRID_EVENT_WEBHOOK_PRIVATE_KEY, SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY } from "./keypair";
import { MockSendGridServer } from "./mock-server";

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
process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY = SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY;
process.env.SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED = "true";
process.env.SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = "300";

const { app } = await import("../../packages/api/src/app");
const { prisma } = await import("../../packages/api/src/database/prisma");
const { redis } = await import("../../packages/api/src/services/redis");

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

describe("SendGrid parity E2E", () => {
	let sendGrid: MockSendGridServer;

	beforeAll(async () => {
		sendGrid = new MockSendGridServer();
		process.env.SENDGRID_API_BASE_URL = await sendGrid.start();
		execFileSync("yarn", ["migrate:deploy"], { stdio: "inherit", env: process.env });
		await prisma.$connect();
	});

	afterAll(async () => {
		await prisma.$executeRawUnsafe(
			`TRUNCATE TABLE ${truncateTables.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
		);
		await redis.quit();
		await prisma.$disconnect();
		await sendGrid.stop();
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
		expect(sendGrid.domainAuthRequests).toEqual([
			{ domain: "example.com", subdomain: "mail", automatic_security: true, default: false },
		]);

		const storedDomain = await prisma.domain.findFirstOrThrow({ where: { projectId: project.id } });
		expect(storedDomain.provider).toBe("SENDGRID");
		expect(storedDomain.providerDomainId).toBe("1000");
		expect(storedDomain.verified).toBe(false);
		expect(storedDomain.providerRecords).toEqual(identity.body.records);

		await request(app).post("/identities/update").expect(200);
		expect(sendGrid.validateRequests).toEqual(["1000"]);

		const verifiedProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
		expect(verifiedProject.verified).toBe(true);
		expect((await prisma.domain.findUniqueOrThrow({ where: { id: storedDomain.id } })).verified).toBe(true);

		const send = await request(app)
			.post("/v1/send")
			.set("Authorization", `Bearer ${project.secret}`)
			.send({
				from: "sender@example.com",
				name: "Sender Name",
				reply: "reply@example.com",
				to: "recipient@example.net",
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
		expect(email.messageId).toBe("sg-message-1");
		expect(email.status).toBe("SENT");
		expect(email.contact.subscribed).toBe(true);

		expect(sendGrid.mailSendRequests).toHaveLength(1);
		const mailSend = sendGrid.mailSendRequests[0];
		expect(mailSend.from).toEqual({ email: "sender@example.com", name: "Sender Name" });
		expect(mailSend.reply_to).toEqual({ email: "reply@example.com" });
		expect(mailSend.personalizations[0]).toMatchObject({
			to: [{ email: "recipient@example.net" }],
			custom_args: { plunk_email_id: emailId },
			headers: { "X-Campaign": "ci" },
		});
		expect(mailSend.subject).toBe("Welcome ");
		expect(mailSend.content[0]).toMatchObject({ type: "text/html" });
		expect(mailSend.content[0].value).toContain("recipient@example.net");
		expect(mailSend.attachments).toEqual([
			{
				filename: "hello.txt",
				type: "text/plain",
				content: Buffer.from("hello").toString("base64"),
				disposition: "attachment",
			},
		]);

		const recipient = email.contact.email;
		const webhookEvents: SendGridWebhookEvent[] = [
			{
				event: "delivered",
				timestamp: 1_800_000_001,
				sg_event_id: "evt-delivered",
				sg_message_id: "sg-message-1",
				email: recipient,
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "open",
				timestamp: 1_800_000_002,
				sg_event_id: "evt-open",
				sg_message_id: "sg-message-1",
				email: recipient,
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "click",
				timestamp: 1_800_000_003,
				sg_event_id: "evt-click",
				sg_message_id: "sg-message-1",
				email: recipient,
				url: "https://example.com/pricing?utm=ci",
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "bounce",
				timestamp: 1_800_000_004,
				sg_event_id: "evt-bounce",
				sg_message_id: "sg-message-1",
				email: recipient,
				reason: "550 hard bounce",
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "spamreport",
				timestamp: 1_800_000_005,
				sg_event_id: "evt-spam",
				sg_message_id: "sg-message-1",
				email: recipient,
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "unsubscribe",
				timestamp: 1_800_000_006,
				sg_event_id: "evt-unsubscribe",
				sg_message_id: "sg-message-1",
				email: recipient,
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "group_unsubscribe",
				timestamp: 1_800_000_007,
				sg_event_id: "evt-group-unsubscribe",
				sg_message_id: "sg-message-1",
				email: recipient,
				custom_args: { plunk_email_id: emailId },
			},
			{
				event: "dropped",
				timestamp: 1_800_000_008,
				sg_event_id: "evt-dropped",
				sg_message_id: "sg-message-1",
				email: recipient,
				reason: "blocked",
				custom_args: { plunk_email_id: emailId },
			},
		];

		const webhook = await postSignedWebhook(webhookEvents);
		expect(webhook.status).toBe(200);
		expect(webhook.body).toEqual({ success: true, processed: 8, duplicate: 0, failed: 0 });

		const processedEmail = await prisma.email.findUniqueOrThrow({
			where: { id: emailId },
			include: { contact: true, clicks: true },
		});
		expect(processedEmail.status).toBe("BOUNCED");
		expect(processedEmail.contact.subscribed).toBe(false);
		expect(processedEmail.clicks).toHaveLength(1);
		expect(processedEmail.clicks[0].link).toBe("https://example.com/pricing?utm=ci");

		expect(await prisma.providerWebhookEvent.count({ where: { provider: "SENDGRID" } })).toBe(8);
		expect(await prisma.trigger.count({ where: { contactId: email.contactId } })).toBe(8);
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
		expect(replay.body).toEqual({ success: true, processed: 0, duplicate: 8, failed: 0 });
		expect(await prisma.providerWebhookEvent.count({ where: { provider: "SENDGRID" } })).toBe(8);
		expect(await prisma.trigger.count({ where: { contactId: email.contactId } })).toBe(8);
		expect(await prisma.click.count({ where: { emailId } })).toBe(1);

		await request(app).post("/identities/reset").set("Cookie", cookie).send({ id: project.id }).expect(200);
		expect(sendGrid.deleteRequests).toEqual(["1000"]);
		expect(await prisma.domain.count({ where: { projectId: project.id } })).toBe(0);
		expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).email).toBeNull();
	});
});
