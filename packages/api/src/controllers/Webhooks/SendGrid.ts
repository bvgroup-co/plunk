import crypto from "node:crypto";
import { Controller, Middleware, Post } from "@overnightjs/core";
import type { NextFunction, Request, Response } from "express";
import signale from "signale";
import { z } from "zod";
import {
	EMAIL_PROVIDER_IS_SENDGRID,
	SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY,
	SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED,
	SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from "../../app/constants";
import { HttpException } from "../../exceptions";
import { ProviderEventService, deterministicEventId } from "../../services/EmailProviderService";

const actionableEvents = new Set([
	"delivered",
	"open",
	"click",
	"bounce",
	"spamreport",
	"unsubscribe",
	"group_unsubscribe",
	"dropped",
]);

const sendGridWebhookEventSchema = z
	.object({
		event: z.string().min(1),
		timestamp: z.number().optional(),
		sg_event_id: z.string().optional(),
		sg_message_id: z.string().optional(),
		email: z.string().optional(),
		url: z.string().optional(),
		reason: z.string().optional(),
		custom_args: z
			.object({
				plunk_email_id: z.string().optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

const sendGridWebhookEventsSchema = z.array(sendGridWebhookEventSchema);
type SendGridWebhookEvent = z.infer<typeof sendGridWebhookEventSchema>;

function assertSendGridEnabled(_req: Request, res: Response, next: NextFunction): void {
	if (!EMAIL_PROVIDER_IS_SENDGRID) {
		res.status(404).json({ success: false });
		return;
	}

	next();
}

function parsePublicKey(publicKey: string): crypto.KeyObject {
	const trimmed = publicKey.trim();
	if (trimmed.startsWith("-----BEGIN PUBLIC KEY-----")) {
		return crypto.createPublicKey(trimmed);
	}

	return crypto.createPublicKey({ key: Buffer.from(trimmed, "base64"), format: "der", type: "spki" });
}

function verifySignature(rawBody: Buffer, signature: string, timestamp: string): boolean {
	const verifier = crypto.createVerify("sha256");
	verifier.update(timestamp);
	verifier.update(rawBody);
	verifier.end();
	return verifier.verify(parsePublicKey(SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY), Buffer.from(signature, "base64"));
}

function parseEvents(req: Request): SendGridWebhookEvent[] {
	if (!Buffer.isBuffer(req.body)) {
		throw new HttpException(400, "Raw request body is required");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(req.body.toString("utf8")) as unknown;
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new HttpException(400, "SendGrid event webhook payload must be valid JSON");
		}

		throw error;
	}

	const result = sendGridWebhookEventsSchema.safeParse(parsed);
	if (!result.success) {
		throw new HttpException(400, result.error.issues[0].message);
	}

	return result.data;
}

function assertSignature(req: Request): void {
	if (!SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED) {
		return;
	}

	if (!SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY) {
		throw new HttpException(503, "SendGrid event webhook signature verification is not configured");
	}

	const signature = req.header("X-Twilio-Email-Event-Webhook-Signature");
	const timestamp = req.header("X-Twilio-Email-Event-Webhook-Timestamp");

	if (!signature || !timestamp) {
		throw new HttpException(401, "Missing SendGrid event webhook signature headers");
	}

	const timestampSeconds = Number.parseInt(timestamp, 10);
	if (!Number.isInteger(timestampSeconds)) {
		throw new HttpException(401, "Invalid SendGrid event webhook timestamp");
	}

	const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
	if (ageSeconds > SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
		throw new HttpException(401, "SendGrid event webhook timestamp is outside the allowed tolerance");
	}

	if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, signature, timestamp)) {
		throw new HttpException(401, "Invalid SendGrid event webhook signature");
	}
}

@Controller("sendgrid")
export class SendGridWebhooks {
	@Post("events")
	@Middleware([assertSendGridEnabled])
	public async receiveEvents(req: Request, res: Response) {
		assertSignature(req);

		const events = parseEvents(req);
		let processed = 0;
		let duplicate = 0;
		let failed = 0;

		for (const event of events) {
			const providerEventId = event.sg_event_id ?? deterministicEventId(event);

			if (!actionableEvents.has(event.event)) {
				const inserted = await ProviderEventService.recordEvent({
					providerEventId,
					event: event.event,
					payload: event,
					email: null,
					status: "IGNORED",
				});
				duplicate += inserted ? 0 : 1;
				continue;
			}

			let email = null;
			let correlationError = "Could not correlate SendGrid event to a Plunk email";
			try {
				email = await ProviderEventService.findEmail(event.custom_args?.plunk_email_id, event.sg_message_id);
			} catch (error) {
				correlationError = error instanceof Error ? error.message : correlationError;
			}

			if (!email) {
				const inserted = await ProviderEventService.recordEvent({
					providerEventId,
					event: event.event,
					payload: event,
					email,
					status: "FAILED",
					error: correlationError,
				});
				if (inserted) {
					failed += 1;
					signale.warn(`Could not correlate SendGrid event ${providerEventId}`);
				} else {
					duplicate += 1;
				}
				continue;
			}

			const inserted = await ProviderEventService.recordEvent({
				providerEventId,
				event: event.event,
				payload: event,
				email,
				status: "PROCESSED",
			});

			if (!inserted) {
				duplicate += 1;
				continue;
			}

			await ProviderEventService.apply({ email, event: event.event, url: event.url, reason: event.reason });
			processed += 1;
		}

		return res.status(200).json({ success: true, processed, duplicate, failed });
	}
}
