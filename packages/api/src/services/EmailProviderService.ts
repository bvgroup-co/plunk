import crypto from "node:crypto";
import type { Contact, Email, EmailStatus } from "@prisma/client";
import signale from "signale";
import {
	AWS_REGION,
	EMAIL_PROVIDER,
	SENDGRID_API_KEY,
	SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY,
	SENDGRID_DOMAIN_AUTH_DEFAULT,
	SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
	SENDGRID_ON_BEHALF_OF,
	SENDGRID_REGION,
} from "../app/constants";
import { prisma } from "../database/prisma";
import { HttpException } from "../exceptions";
import { getIdentities, getIdentityVerificationAttributes, ses, verifyIdentity } from "../util/ses";
import { ActionService } from "./ActionService";
import { EventService } from "./EventService";
import { ProjectService } from "./ProjectService";
import { Keys } from "./keys";
import { redis } from "./redis";

export type DnsRecord = {
	type: string;
	host: string;
	value: string;
};

export type DomainDetails = {
	provider: "ses" | "sendgrid";
	tokens: string[];
	records: DnsRecord[];
};

type SendGridDnsRecord = {
	type: string;
	host: string;
	data: string;
	valid?: boolean;
};

type SendGridDomainResponse = {
	id: number;
	domain: string;
	subdomain?: string;
	valid?: boolean;
	dns?: Record<string, SendGridDnsRecord>;
};

type SendGridValidateResponse = {
	valid: boolean;
	validation_results?: Record<string, { valid: boolean; reason?: string }>;
};

type ProjectIdentity = {
	id: string;
	email: string | null;
	verified: boolean;
	public: string;
	secret: string;
};

const SENDGRID_BASE_URLS = {
	global: "https://api.sendgrid.com",
	eu: "https://api.eu.sendgrid.com",
} as const;

function getDomainFromEmail(email: string): string {
	return email.split("@")[1].toLowerCase();
}

function serializeRecords(records: DnsRecord[]): DnsRecord[] {
	return records.map((record) => ({
		type: record.type.toUpperCase(),
		host: record.host,
		value: record.value,
	}));
}

function recordsFromSendGrid(response: SendGridDomainResponse): DnsRecord[] {
	return serializeRecords(
		Object.values(response.dns ?? {}).map((record) => ({
			type: record.type,
			host: record.host,
			value: record.data,
		})),
	);
}

function buildSesRecords(domain: string, tokens: string[]): DnsRecord[] {
	const subdomain = domain.split(".").length > 2 ? domain.split(".")[0] : "";
	return [
		{ type: "TXT", host: "plunk", value: "v=spf1 include:amazonses.com ~all" },
		{ type: "MX", host: "plunk", value: `10 feedback-smtp.${AWS_REGION}.amazonses.com` },
		...tokens.map((token) => ({
			type: "CNAME",
			host: `${token}._domainkey${subdomain ? `.${subdomain}` : ""}`,
			value: `${token}.dkim.amazonses.com`,
		})),
	];
}

async function sendGridRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (!SENDGRID_API_KEY) {
		throw new HttpException(503, "SendGrid is not configured");
	}

	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${SENDGRID_API_KEY}`);
	headers.set("Content-Type", "application/json");

	if (SENDGRID_ON_BEHALF_OF) {
		headers.set("On-Behalf-Of", SENDGRID_ON_BEHALF_OF);
	}

	const response = await fetch(`${SENDGRID_BASE_URLS[SENDGRID_REGION]}${path}`, { ...init, headers });

	if (!response.ok) {
		const body = await response.text();
		throw new HttpException(response.status, body || "SendGrid request failed");
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

async function cacheProjectIdentity(project: ProjectIdentity): Promise<void> {
	await redis.del(Keys.Project.id(project.id));
	await redis.del(Keys.Project.secret(project.secret));
	await redis.del(Keys.Project.public(project.public));
}

export class DomainService {
	public static async details(project: ProjectIdentity): Promise<DomainDetails> {
		if (!project.email) {
			throw new Error("Project does not have a configured sender domain");
		}

		const domain = getDomainFromEmail(project.email);
		const dbDomain = await prisma.domain.findFirst({ where: { projectId: project.id, domain } });

		if (EMAIL_PROVIDER === "sendgrid") {
			return {
				provider: "sendgrid",
				tokens: [],
				records: serializeRecords((dbDomain?.providerRecords as DnsRecord[] | null) ?? []),
			};
		}

		const attributes = await getIdentityVerificationAttributes(project.email);
		const tokens = attributes.tokens ?? [];
		if (attributes.status === "Success" && !project.verified) {
			await prisma.project.update({ where: { id: project.id }, data: { verified: true } });
			await prisma.domain.updateMany({
				where: { projectId: project.id, domain, provider: "SES" },
				data: { verified: true, verifiedAt: new Date(), dkimTokens: tokens },
			});
			await cacheProjectIdentity(project);
		}

		return {
			provider: "ses",
			tokens,
			records: buildSesRecords(domain, tokens),
		};
	}

	public static async create(project: ProjectIdentity, email: string): Promise<DomainDetails> {
		const domain = getDomainFromEmail(email);
		const existingProject = await prisma.project.findFirst({
			where: { email: { endsWith: `@${domain}` }, id: { not: project.id } },
		});

		if (existingProject) {
			throw new Error("Domain already attached to another project");
		}

		if (EMAIL_PROVIDER === "sendgrid") {
			const sendGridDomain = await sendGridRequest<SendGridDomainResponse>("/v3/whitelabel/domains", {
				method: "POST",
				body: JSON.stringify({
					domain,
					subdomain: SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
					automatic_security: SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY,
					default: SENDGRID_DOMAIN_AUTH_DEFAULT,
				}),
			});
			const records = recordsFromSendGrid(sendGridDomain);

			await prisma.$transaction([
				prisma.project.update({ where: { id: project.id }, data: { email, verified: false } }),
				prisma.domain.upsert({
					where: { projectId_domain: { projectId: project.id, domain } },
					create: {
						domain,
						email,
						projectId: project.id,
						provider: "SENDGRID",
						verified: Boolean(sendGridDomain.valid),
						providerDomainId: String(sendGridDomain.id),
						providerSubdomain: sendGridDomain.subdomain ?? SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
						providerRecords: records,
						providerData: sendGridDomain,
					},
					update: {
						email,
						provider: "SENDGRID",
						verified: Boolean(sendGridDomain.valid),
						providerDomainId: String(sendGridDomain.id),
						providerSubdomain: sendGridDomain.subdomain ?? SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
						providerRecords: records,
						providerData: sendGridDomain,
						providerError: null,
					},
				}),
			]);
			await cacheProjectIdentity(project);

			return { provider: "sendgrid", tokens: [], records };
		}

		const tokens = (await verifyIdentity(email)) ?? [];
		await prisma.$transaction([
			prisma.project.update({ where: { id: project.id }, data: { email, verified: false } }),
			prisma.domain.upsert({
				where: { projectId_domain: { projectId: project.id, domain } },
				create: { domain, email, projectId: project.id, provider: "SES", dkimTokens: tokens, verified: false },
				update: { email, provider: "SES", dkimTokens: tokens, verified: false, providerError: null },
			}),
		]);
		await cacheProjectIdentity(project);

		return { provider: "ses", tokens, records: buildSesRecords(domain, tokens) };
	}

	public static async delete(project: ProjectIdentity): Promise<void> {
		if (project.email) {
			const domain = getDomainFromEmail(project.email);
			const dbDomain = await prisma.domain.findFirst({ where: { projectId: project.id, domain } });

			if (dbDomain?.provider === "SENDGRID" && dbDomain.providerDomainId) {
				await sendGridRequest(`/v3/whitelabel/domains/${dbDomain.providerDomainId}`, { method: "DELETE" });
			}
		}

		await prisma.$transaction([
			prisma.domain.deleteMany({ where: { projectId: project.id } }),
			prisma.project.update({ where: { id: project.id }, data: { email: null, verified: false } }),
		]);
		await cacheProjectIdentity(project);
	}

	public static async updateAll(): Promise<void> {
		if (EMAIL_PROVIDER === "sendgrid") {
			await DomainService.updateSendGridDomains();
			return;
		}

		await DomainService.updateSesDomains();
	}

	private static async updateSesDomains(): Promise<void> {
		const count = await prisma.project.count({ where: { email: { not: null } } });

		for (let i = 0; i < count; i += 99) {
			const dbIdentities = await prisma.project.findMany({
				where: { email: { not: null } },
				select: { id: true, email: true, verified: true, public: true, secret: true },
				skip: i,
				take: 99,
			});

			const awsIdentities = await getIdentities(dbIdentities.map((identity) => identity.email as string));

			for (const identity of awsIdentities) {
				const project = dbIdentities.find((item) => item.email?.endsWith(identity.email));

				if (!project?.email) {
					continue;
				}

				if (identity.status === "Failed") {
					signale.info(`Restarting verification for ${identity.email}`);
					void verifyIdentity(identity.email);
				}

				const verified = identity.status === "Success";
				await prisma.project.update({ where: { id: project.id }, data: { verified } });
				await prisma.domain.updateMany({
					where: { projectId: project.id, domain: getDomainFromEmail(project.email), provider: "SES" },
					data: { verified, lastCheckedAt: new Date(), verifiedAt: verified ? new Date() : null },
				});

				if (verified) {
					signale.success(`Successfully verified ${identity.email}`);
					void ses.setIdentityFeedbackForwardingEnabled({ Identity: identity.email, ForwardingEnabled: false });
				}

				await cacheProjectIdentity(project);
			}
		}
	}

	private static async updateSendGridDomains(): Promise<void> {
		const domains = await prisma.domain.findMany({
			where: { provider: "SENDGRID", providerDomainId: { not: null } },
			include: { project: true },
		});

		for (const domain of domains) {
			const validation = await sendGridRequest<SendGridValidateResponse>(
				`/v3/whitelabel/domains/${domain.providerDomainId}/validate`,
				{ method: "POST" },
			);
			const verified = validation.valid;

			await prisma.$transaction([
				prisma.domain.update({
					where: { id: domain.id },
					data: {
						verified,
						lastCheckedAt: new Date(),
						verifiedAt: verified ? new Date() : null,
						providerData: validation,
						providerError: verified ? null : JSON.stringify(validation.validation_results ?? {}),
					},
				}),
				prisma.project.update({ where: { id: domain.projectId }, data: { verified } }),
			]);

			await cacheProjectIdentity(domain.project);
		}
	}
}

const statusRank: Record<EmailStatus, number> = {
	SENT: 0,
	DELIVERED: 1,
	OPENED: 2,
	CLICKED: 3,
	BOUNCED: 4,
	COMPLAINT: 4,
	COMPLAINED: 4,
	FAILED: 4,
};

function normalizeMessageId(messageId: string): string {
	return messageId.split(".")[0].replace(/^<|>$/g, "");
}

function shouldUpdateStatus(current: EmailStatus, next: EmailStatus): boolean {
	return statusRank[next] >= statusRank[current];
}

async function triggerEmailEvent(email: Email & { contact: Contact }, eventName: string) {
	const project = await ProjectService.id(email.contact.projectId);
	if (!project) {
		throw new Error("Could not load project for provider event");
	}

	let event = await EventService.event(project.id, eventName);
	if (!event) {
		event = await prisma.event.create({ data: { name: eventName, projectId: project.id } });
		await redis.del(Keys.Project.events(project.id, true));
		await redis.del(Keys.Project.events(project.id, false));
		await redis.del(Keys.Event.event(project.id, event.name));
		await redis.del(Keys.Event.id(event.id));
	}

	await prisma.trigger.create({ data: { contactId: email.contactId, eventId: event.id } });
	void ActionService.trigger({ event, contact: email.contact, project });
}

export class ProviderEventService {
	public static async findEmail(plunkEmailId: string | undefined, providerMessageId: string | undefined) {
		if (plunkEmailId) {
			const email = await prisma.email.findUnique({ where: { id: plunkEmailId }, include: { contact: true } });
			if (email) {
				return email;
			}
		}

		if (!providerMessageId) {
			throw new Error("SendGrid event does not contain a provider message ID");
		}

		const direct = await prisma.email.findUnique({ where: { messageId: providerMessageId }, include: { contact: true } });
		if (direct) {
			return direct;
		}

		const normalized = await prisma.email.findFirst({
			where: { messageId: { startsWith: normalizeMessageId(providerMessageId) } },
			include: { contact: true },
		});

		if (!normalized) {
			throw new Error("Could not correlate SendGrid event to a Plunk email");
		}

		return normalized;
	}

	public static async recordEvent({
		providerEventId,
		event,
		payload,
		email,
		status,
		error,
	}: {
		providerEventId: string;
		event: string;
		payload: object;
		email: Email | null;
		status: "PROCESSED" | "FAILED" | "IGNORED";
		error?: string;
	}): Promise<boolean> {
		try {
			await prisma.providerWebhookEvent.create({
				data: { provider: "SENDGRID", providerEventId, event, payload, emailId: email?.id, status, error },
			});
			return true;
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
				return false;
			}
			throw error;
		}
	}

	public static async apply({
		email,
		event,
		url,
		reason,
	}: {
		email: Email & { contact: Contact };
		event: string;
		url?: string;
		reason?: string;
	}): Promise<void> {
		if (event === "unsubscribe" || event === "group_unsubscribe") {
			await prisma.contact.update({ where: { id: email.contactId }, data: { subscribed: false } });
			await redis.del(Keys.Contact.id(email.contactId));
			await redis.del(Keys.Contact.email(email.contact.projectId, email.contact.email));
			await triggerEmailEvent(email, "unsubscribe");
			return;
		}

		const nextStatus = ProviderEventService.statusForEvent(event);
		if (!nextStatus) {
			throw new Error(`Unsupported SendGrid event: ${event}`);
		}

		if (nextStatus === "CLICKED" && url) {
			await prisma.click.create({ data: { emailId: email.id, link: url } });
		}

		if (shouldUpdateStatus(email.status, nextStatus)) {
			await prisma.email.update({ where: { id: email.id }, data: { status: nextStatus } });
		}

		if (nextStatus === "BOUNCED" || nextStatus === "COMPLAINED") {
			await prisma.contact.update({ where: { id: email.contactId }, data: { subscribed: false } });
			await redis.del(Keys.Contact.id(email.contactId));
			await redis.del(Keys.Contact.email(email.contact.projectId, email.contact.email));
		}

		await triggerEmailEvent(email, ProviderEventService.internalEventForStatus(nextStatus));
		await redis.del(Keys.Project.emails(email.contact.projectId));
		await redis.del(Keys.Project.emails(email.contact.projectId, { count: true }));
		await redis.del(Keys.Project.analytics(email.contact.projectId));

		if (reason) {
			signale.warn(`SendGrid ${event} for ${email.contact.email}: ${reason}`);
		}
	}

	private static statusForEvent(event: string): EmailStatus | null {
		switch (event) {
			case "delivered":
				return "DELIVERED";
			case "open":
				return "OPENED";
			case "click":
				return "CLICKED";
			case "bounce":
				return "BOUNCED";
			case "spamreport":
				return "COMPLAINED";
			case "dropped":
				return "FAILED";
		}

		throw new Error(`Unsupported SendGrid event: ${event}`);
	}

	private static internalEventForStatus(status: EmailStatus): string {
		switch (status) {
			case "DELIVERED":
				return "email.delivered";
			case "OPENED":
				return "email.opened";
			case "CLICKED":
				return "email.clicked";
			case "BOUNCED":
				return "email.bounced";
			case "COMPLAINED":
			case "COMPLAINT":
				return "email.complained";
			case "FAILED":
				return "email.failed";
			case "SENT":
				throw new Error("SENT does not have a provider webhook event");
		}
	}
}

export function deterministicEventId(payload: object): string {
	return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
