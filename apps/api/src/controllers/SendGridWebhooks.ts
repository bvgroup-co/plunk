import crypto from 'node:crypto';
import type {Request, Response} from 'express';
import {EmailStatus, Prisma, WebhookEventStatus} from '@plunk/db';
import {z} from 'zod';
import signale from 'signale';

import {
  EMAIL_PROVIDER_IS_SENDGRID,
  SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY,
  SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED,
  SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';
import {EmailService} from '../services/EmailService.js';

const actionableEvents = new Set([
  'delivered',
  'open',
  'click',
  'bounce',
  'spamreport',
  'unsubscribe',
  'group_unsubscribe',
  'dropped',
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

function assertSendGridEnabled(): void {
  if (!EMAIL_PROVIDER_IS_SENDGRID) {
    throw new HttpException(404, 'SendGrid webhooks are not enabled');
  }
}

function parsePublicKey(publicKey: string): crypto.KeyObject {
  const trimmed = publicKey.trim();
  if (trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) {
    return crypto.createPublicKey(trimmed);
  }

  return crypto.createPublicKey({key: Buffer.from(trimmed, 'base64'), format: 'der', type: 'spki'});
}

function verifySignature(rawBody: Buffer, signature: string, timestamp: string): boolean {
  const verifier = crypto.createVerify('sha256');
  verifier.update(timestamp);
  verifier.update(rawBody);
  verifier.end();
  return verifier.verify(parsePublicKey(SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY), Buffer.from(signature, 'base64'));
}

function parseEvents(req: Request): SendGridWebhookEvent[] {
  if (!Buffer.isBuffer(req.body)) {
    throw new HttpException(400, 'Raw request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(req.body.toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HttpException(400, 'SendGrid event webhook payload must be valid JSON');
    }

    throw error;
  }

  const result = sendGridWebhookEventsSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpException(400, result.error.issues[0]?.message ?? 'Invalid SendGrid event webhook payload');
  }

  return result.data;
}

function assertSignature(req: Request): void {
  if (!SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED) {
    return;
  }

  if (!SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY) {
    throw new HttpException(503, 'SendGrid event webhook signature verification is not configured');
  }

  const signature = req.header('X-Twilio-Email-Event-Webhook-Signature');
  const timestamp = req.header('X-Twilio-Email-Event-Webhook-Timestamp');

  if (!signature || !timestamp) {
    throw new HttpException(401, 'Missing SendGrid event webhook signature headers');
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isInteger(timestampSeconds)) {
    throw new HttpException(401, 'Invalid SendGrid event webhook timestamp');
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    throw new HttpException(401, 'SendGrid event webhook timestamp is outside the allowed tolerance');
  }

  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, signature, timestamp)) {
    throw new HttpException(401, 'Invalid SendGrid event webhook signature');
  }
}

function normalizeMessageId(messageId: string): string {
  return messageId.split('.')[0]?.replace(/^<|>$/g, '') ?? messageId;
}

function deterministicEventId(payload: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function statusForEvent(event: string): EmailStatus | null {
  switch (event) {
    case 'delivered':
      return EmailStatus.DELIVERED;
    case 'open':
      return EmailStatus.OPENED;
    case 'click':
      return EmailStatus.CLICKED;
    case 'bounce':
      return EmailStatus.BOUNCED;
    case 'spamreport':
      return EmailStatus.COMPLAINED;
    case 'dropped':
      return EmailStatus.FAILED;
    case 'unsubscribe':
    case 'group_unsubscribe':
      return null;
  }

  throw new Error(`Unsupported SendGrid event: ${event}`);
}

function shouldUpdateStatus(current: EmailStatus, next: EmailStatus): boolean {
  return next === current || statusRank[next] > statusRank[current];
}

function webhookEventForStatus(status: EmailStatus): 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' {
  switch (status) {
    case EmailStatus.DELIVERED:
      return 'delivered';
    case EmailStatus.OPENED:
      return 'opened';
    case EmailStatus.CLICKED:
      return 'clicked';
    case EmailStatus.BOUNCED:
      return 'bounced';
    case EmailStatus.COMPLAINED:
      return 'complained';
    case EmailStatus.PENDING:
    case EmailStatus.SENDING:
    case EmailStatus.SENT:
    case EmailStatus.RECEIVED:
    case EmailStatus.FAILED:
      throw new Error(`Email status ${status} does not map to a SendGrid webhook event`);
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
    throw new Error('SendGrid event does not contain a provider message ID');
  }

  const direct = await prisma.email.findUnique({
    where: {messageId: providerMessageId},
    include: {contact: true, project: true},
  });
  if (direct) {
    return direct;
  }

  const normalized = await prisma.email.findFirst({
    where: {messageId: {startsWith: normalizeMessageId(providerMessageId)}},
    include: {contact: true, project: true},
  });

  if (!normalized) {
    throw new Error('Could not correlate SendGrid event to a Plunk email');
  }

  return normalized;
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
      data: {provider: 'SENDGRID', providerEventId, event, payload, emailId: email?.id, status, error},
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

async function applySendGridEvent({
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
  if (event === 'unsubscribe' || event === 'group_unsubscribe') {
    await prisma.contact.update({where: {id: email.contactId}, data: {subscribed: false}});
    await prisma.event.create({
      data: {
        projectId: email.projectId,
        contactId: email.contactId,
        emailId: email.id,
        name: 'email.unsubscribed',
        data: {provider: 'sendgrid'},
      },
    });
    return;
  }

  const nextStatus = statusForEvent(event);
  if (!nextStatus) {
    throw new Error(`Unsupported SendGrid event: ${event}`);
  }

  if (shouldUpdateStatus(email.status, nextStatus)) {
    await EmailService.handleWebhookEvent(email.id, webhookEventForStatus(nextStatus), {
      provider: 'sendgrid',
      url,
      reason,
    });
  }

  if (reason) {
    signale.warn(`SendGrid ${event} for ${email.contact.email}: ${reason}`);
  }
}

export class SendGridWebhooks {
  public static async receiveEvents(req: Request, res: Response) {
    assertSendGridEnabled();
    assertSignature(req);

    const events = parseEvents(req);
    let processed = 0;
    let duplicate = 0;
    let failed = 0;

    for (const event of events) {
      const providerEventId = event.sg_event_id ?? deterministicEventId(event);

      if (!actionableEvents.has(event.event)) {
        const inserted = await recordEvent({
          providerEventId,
          event: event.event,
          payload: event,
          email: null,
          status: WebhookEventStatus.IGNORED,
        });
        duplicate += inserted ? 0 : 1;
        continue;
      }

      let email = null;
      let correlationError = 'Could not correlate SendGrid event to a Plunk email';
      try {
        email = await findEmail(event.custom_args?.plunk_email_id, event.sg_message_id);
      } catch (error) {
        correlationError = error instanceof Error ? error.message : correlationError;
      }

      if (!email) {
        const inserted = await recordEvent({
          providerEventId,
          event: event.event,
          payload: event,
          email,
          status: WebhookEventStatus.FAILED,
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

      const inserted = await recordEvent({
        providerEventId,
        event: event.event,
        payload: event,
        email,
        status: WebhookEventStatus.PROCESSED,
      });

      if (!inserted) {
        duplicate += 1;
        continue;
      }

      await applySendGridEvent({email, event: event.event, url: event.url, reason: event.reason});
      processed += 1;
    }

    return res.status(200).json({success: true, processed, duplicate, failed});
  }
}
