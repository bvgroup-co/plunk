import crypto from 'node:crypto';

import type {Request, Response} from 'express';
import {EmailStatus, Prisma, WebhookEventStatus} from '@plunk/db';
import signale from 'signale';
import {z} from 'zod';

import {EMAIL_PROVIDER_IS_POSTAL, POSTAL_WEBHOOK_SECRET, POSTAL_WEBHOOK_SIGNATURE_REQUIRED} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';
import {EmailService} from '../services/EmailService.js';

const actionableEvents = new Set(['sent', 'delivered', 'bounced', 'failed', 'held', 'opened', 'loaded', 'clicked']);

const postalWebhookEventSchema = z
  .object({
    event: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    uuid: z.union([z.string(), z.number()]).optional(),
    token: z.string().optional(),
    message_id: z.union([z.string(), z.number()]).optional(),
    message: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        message_id: z.union([z.string(), z.number()]).optional(),
        token: z.string().optional(),
        headers: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    payload: z.unknown().optional(),
    headers: z.record(z.string(), z.unknown()).optional(),
    url: z.string().optional(),
    link: z.string().optional(),
    details: z.string().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

const postalWebhookEventsSchema = z.union([postalWebhookEventSchema, z.array(postalWebhookEventSchema)]);
type PostalWebhookEvent = z.infer<typeof postalWebhookEventSchema>;
type EmailWithContact = NonNullable<Awaited<ReturnType<typeof findEmail>>>;

const statusRank: Record<EmailStatus, number> = {
  PENDING: -2,
  SENDING: -1,
  SENT: 0,
  DELIVERED: 1,
  RECEIVED: 1,
  OPENED: 2,
  CLICKED: 3,
  BOUNCED: 4,
  COMPLAINED: 4,
  FAILED: 4,
};

function assertPostalEnabled(): void {
  if (!EMAIL_PROVIDER_IS_POSTAL) {
    throw new HttpException(404, 'Postal webhooks are not enabled');
  }
}

function assertSecret(req: Request): void {
  if (!POSTAL_WEBHOOK_SIGNATURE_REQUIRED) {
    return;
  }

  if (!POSTAL_WEBHOOK_SECRET) {
    throw new HttpException(503, 'Postal webhook secret is not configured');
  }

  const providedSecret = req.header('X-Plunk-Postal-Webhook-Secret') ?? String(req.query.secret ?? '');
  if (!providedSecret || providedSecret !== POSTAL_WEBHOOK_SECRET) {
    throw new HttpException(401, 'Invalid Postal webhook secret');
  }
}

function parseEvents(req: Request): PostalWebhookEvent[] {
  if (!Buffer.isBuffer(req.body)) {
    throw new HttpException(400, 'Raw request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(req.body.toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HttpException(400, 'Postal webhook payload must be valid JSON');
    }

    throw error;
  }

  const result = postalWebhookEventsSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpException(400, result.error.issues[0]?.message ?? 'Invalid Postal webhook payload');
  }

  return Array.isArray(result.data) ? result.data : [result.data];
}

function deterministicEventId(payload: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function eventName(event: PostalWebhookEvent): string {
  const name = event.event ?? event.status ?? event.type;
  if (!name) {
    throw new Error('Postal event does not include an event name');
  }

  return name.toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return stringValue(entry?.[1]);
}

function getHeaders(event: PostalWebhookEvent): Record<string, unknown> | undefined {
  return event.headers ?? event.message?.headers;
}

function getPlunkEmailId(event: PostalWebhookEvent): string | undefined {
  return headerValue(getHeaders(event), 'X-Plunk-Email-ID');
}

function getPostalMessageId(event: PostalWebhookEvent): string | undefined {
  return (
    stringValue(event.message_id) ??
    stringValue(event.message?.message_id) ??
    stringValue(event.message?.id) ??
    stringValue(event.token) ??
    stringValue(event.message?.token)
  );
}

function getProviderEventId(event: PostalWebhookEvent): string {
  return stringValue(event.id) ?? stringValue(event.uuid) ?? deterministicEventId(event);
}

function statusForEvent(event: string): EmailStatus {
  switch (event) {
    case 'sent':
    case 'delivered':
      return EmailStatus.DELIVERED;
    case 'opened':
    case 'loaded':
      return EmailStatus.OPENED;
    case 'clicked':
      return EmailStatus.CLICKED;
    case 'bounced':
      return EmailStatus.BOUNCED;
    case 'failed':
    case 'held':
      return EmailStatus.FAILED;
  }

  throw new Error(`Unsupported Postal event: ${event}`);
}

function shouldUpdateStatus(current: EmailStatus, next: EmailStatus): boolean {
  return next === current || statusRank[next] > statusRank[current];
}

function webhookEventForStatus(status: EmailStatus): 'delivered' | 'opened' | 'clicked' | 'bounced' {
  switch (status) {
    case EmailStatus.DELIVERED:
      return 'delivered';
    case EmailStatus.OPENED:
      return 'opened';
    case EmailStatus.CLICKED:
      return 'clicked';
    case EmailStatus.BOUNCED:
      return 'bounced';
    case EmailStatus.PENDING:
    case EmailStatus.SENDING:
    case EmailStatus.SENT:
    case EmailStatus.RECEIVED:
    case EmailStatus.COMPLAINED:
    case EmailStatus.FAILED:
      throw new Error(`Email status ${status} does not map to a Postal webhook event`);
  }
}

async function findEmail(plunkEmailId: string | undefined, providerMessageId: string | undefined) {
  if (plunkEmailId) {
    const email = await prisma.email.findUnique({where: {id: plunkEmailId}, include: {contact: true, project: true}});
    if (email) {
      return email;
    }
  }

  if (!providerMessageId) {
    throw new Error('Postal event does not contain a provider message ID');
  }

  const email = await prisma.email.findUnique({
    where: {messageId: providerMessageId},
    include: {contact: true, project: true},
  });

  if (!email) {
    throw new Error('Could not correlate Postal event to a Plunk email');
  }

  return email;
}

async function recordEvent({
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
  email: {id: string} | null;
  status: WebhookEventStatus;
  error?: string;
}): Promise<boolean> {
  try {
    await prisma.providerWebhookEvent.create({
      data: {provider: 'POSTAL', providerEventId, event, payload, emailId: email?.id, status, error},
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

async function applyPostalEvent({
  email,
  event,
  url,
  reason,
}: {
  email: EmailWithContact;
  event: string;
  url?: string;
  reason?: string;
}): Promise<void> {
  const nextStatus = statusForEvent(event);
  if (!nextStatus) {
    throw new Error(`Unsupported Postal event: ${event}`);
  }

  if (nextStatus === EmailStatus.FAILED) {
    if (shouldUpdateStatus(email.status, nextStatus)) {
      await prisma.email.update({where: {id: email.id}, data: {status: EmailStatus.FAILED, error: reason}});
      await prisma.event.create({
        data: {
          projectId: email.projectId,
          contactId: email.contactId,
          emailId: email.id,
          name: 'email.failed',
          data: {provider: 'postal', reason},
        },
      });
    }
  } else if (nextStatus !== EmailStatus.SENT && shouldUpdateStatus(email.status, nextStatus)) {
    await EmailService.handleWebhookEvent(email.id, webhookEventForStatus(nextStatus), {
      provider: 'postal',
      url,
      reason,
    });
  }

  if (reason) {
    signale.warn(`Postal ${event} for ${email.contact.email}: ${reason}`);
  }
}

export class PostalWebhooks {
  public static async receiveEvents(req: Request, res: Response) {
    assertPostalEnabled();
    assertSecret(req);

    const events = parseEvents(req);
    let processed = 0;
    let duplicate = 0;
    let failed = 0;

    for (const event of events) {
      let eventType: string;
      try {
        eventType = eventName(event);
      } catch (error) {
        const providerEventId = getProviderEventId(event);
        const inserted = await recordEvent({
          providerEventId,
          event: 'unknown',
          payload: event,
          email: null,
          status: WebhookEventStatus.FAILED,
          error: error instanceof Error ? error.message : 'Invalid Postal event',
        });
        failed += inserted ? 1 : 0;
        duplicate += inserted ? 0 : 1;
        continue;
      }

      const providerEventId = getProviderEventId(event);

      if (!actionableEvents.has(eventType)) {
        const inserted = await recordEvent({
          providerEventId,
          event: eventType,
          payload: event,
          email: null,
          status: WebhookEventStatus.IGNORED,
        });
        duplicate += inserted ? 0 : 1;
        continue;
      }

      let email = null;
      let correlationError = 'Could not correlate Postal event to a Plunk email';
      try {
        email = await findEmail(getPlunkEmailId(event), getPostalMessageId(event));
      } catch (error) {
        correlationError = error instanceof Error ? error.message : correlationError;
      }

      if (!email) {
        const inserted = await recordEvent({
          providerEventId,
          event: eventType,
          payload: event,
          email,
          status: WebhookEventStatus.FAILED,
          error: correlationError,
        });
        if (inserted) {
          failed += 1;
          signale.warn(`Could not correlate Postal event ${providerEventId}`);
        } else {
          duplicate += 1;
        }
        continue;
      }

      const inserted = await recordEvent({
        providerEventId,
        event: eventType,
        payload: event,
        email,
        status: WebhookEventStatus.PROCESSED,
      });

      if (!inserted) {
        duplicate += 1;
        continue;
      }

      await applyPostalEvent({
        email,
        event: eventType,
        url: event.url ?? event.link,
        reason: event.reason ?? event.details,
      });
      processed += 1;
    }

    return res.status(200).json({success: true, processed, duplicate, failed});
  }
}
