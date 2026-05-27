import type {Prisma} from '@plunk/db';
import {EmailSourceType, EmailStatus} from '@plunk/db';
import {simpleParser} from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import signale from 'signale';

import {prisma} from '../database/prisma.js';
import {BillingLimitService} from './BillingLimitService.js';
import {ContactService} from './ContactService.js';
import {EventService} from './EventService.js';
import {MeterService} from './MeterService.js';
import {NtfyService} from './NtfyService.js';
import {SecurityService} from './SecurityService.js';

export type SesEventProcessingStatus = 'processed' | 'duplicate' | 'ignored' | 'invalid';

export type SesEventProcessingResult = {
  status: SesEventProcessingStatus;
  message?: string;
};

type SesEventProcessorOptions = {
  dedupeKey?: string;
};

type SesEventRecord = Record<string, unknown>;

type EmailWithContactAndProject = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.email.findUnique<{
        where: {messageId: string};
        include: {contact: true; project: true};
      }>
    >
  >
>;

const RECEIVED_NOTIFICATION_TYPE = 'Received';
const UNKNOWN_SUBJECT = '(No subject)';

export class SesEventProcessor {
  public static async process(
    event: SesEventRecord,
    options: SesEventProcessorOptions = {},
  ): Promise<SesEventProcessingResult> {
    const dedupeKey = options.dedupeKey;
    let claimed = false;

    if (dedupeKey) {
      claimed = await this.claimMessage(dedupeKey);
      if (!claimed) {
        return {status: 'duplicate', message: 'SES event already processed'};
      }
    }

    try {
      if (event.notificationType === RECEIVED_NOTIFICATION_TYPE) {
        return await this.processInboundEmail(event);
      }

      return await this.processOutboundEvent(event);
    } catch (error) {
      if (dedupeKey && claimed) {
        await this.releaseMessage(dedupeKey);
      }

      throw error;
    }
  }

  private static async processInboundEmail(event: SesEventRecord): Promise<SesEventProcessingResult> {
    signale.info('[SES_EVENTS] Received inbound email notification from SES');

    const recipients = this.readStringArray(this.readRecord(event.receipt)?.recipients);
    if (recipients.length === 0) {
      signale.warn('[SES_EVENTS] No recipients found in inbound email');
      return {status: 'ignored', message: 'No recipients found'};
    }

    for (const recipientEmail of recipients) {
      const domain = recipientEmail.split('@')[1];
      if (!domain) {
        signale.warn('[SES_EVENTS] Invalid recipient email format:', recipientEmail);
        continue;
      }

      const domainRecords = await prisma.domain.findMany({
        where: {domain, verified: true},
        include: {project: true},
      });

      if (domainRecords.length === 0) {
        signale.info(`[SES_EVENTS] No verified domain found for: ${domain}`);
        continue;
      }

      signale.info(
        `[SES_EVENTS] Found ${domainRecords.length} project(s) with verified domain ${domain}. Processing inbound email for all.`,
      );

      const mail = this.readRecord(event.mail);
      const commonHeaders = this.readRecord(mail?.commonHeaders);
      const senderEmail = this.readString(mail?.source);
      const senderFromHeader = this.readStringArray(commonHeaders?.from)[0] ?? senderEmail;
      const htmlBody = await this.parseInboundEmailBody(event);

      for (const domainRecord of domainRecords) {
        signale.info(`[SES_EVENTS] Processing inbound email for project: ${domainRecord.project.name}`);

        const limitCheck = await BillingLimitService.checkLimit(domainRecord.projectId, EmailSourceType.INBOUND);
        if (!limitCheck.allowed) {
          signale.warn(
            `[SES_EVENTS] Inbound email blocked for project ${domainRecord.project.name}: ${limitCheck.message}`,
          );
          continue;
        }

        if (!senderEmail) {
          signale.warn('[SES_EVENTS] Inbound email missing sender address');
          continue;
        }

        const contact = await ContactService.upsert(domainRecord.projectId, senderEmail, undefined, true);
        const inboundEmail = await prisma.email.create({
          data: {
            projectId: domainRecord.projectId,
            contactId: contact.id,
            subject: this.readString(commonHeaders?.subject) ?? UNKNOWN_SUBJECT,
            body: htmlBody ?? '',
            from: recipientEmail,
            sourceType: EmailSourceType.INBOUND,
            status: EmailStatus.RECEIVED,
            deliveredAt: new Date(this.readString(mail?.timestamp) ?? new Date()),
          },
        });

        await BillingLimitService.incrementUsage(domainRecord.projectId, EmailSourceType.INBOUND);

        if (domainRecord.project.customer) {
          await MeterService.recordEmailSent(domainRecord.project.customer, 1, `email_${inboundEmail.id}`);
        }

        await EventService.trackEvent(domainRecord.projectId, 'email.received', contact.id, inboundEmail.id, {
          messageId: this.readString(mail?.messageId),
          from: senderEmail,
          fromHeader: senderFromHeader,
          to: recipientEmail,
          subject: this.readString(commonHeaders?.subject),
          timestamp: this.readString(mail?.timestamp),
          recipients,
          hasContent: typeof event.content === 'string' && event.content.length > 0,
          body: htmlBody,
          spamVerdict: this.readString(this.readRecord(this.readRecord(event.receipt)?.spamVerdict)?.status),
          virusVerdict: this.readString(this.readRecord(this.readRecord(event.receipt)?.virusVerdict)?.status),
          spfVerdict: this.readString(this.readRecord(this.readRecord(event.receipt)?.spfVerdict)?.status),
          dkimVerdict: this.readString(this.readRecord(this.readRecord(event.receipt)?.dkimVerdict)?.status),
          dmarcVerdict: this.readString(this.readRecord(this.readRecord(event.receipt)?.dmarcVerdict)?.status),
          processingTimeMillis: this.readRecord(event.receipt)?.processingTimeMillis,
        });

        signale.success(
          `[SES_EVENTS] Created email.received event for ${senderEmail} -> ${recipientEmail} (project: ${domainRecord.project.name})`,
        );
      }
    }

    return {status: 'processed', message: 'Inbound email processed'};
  }

  private static async processOutboundEvent(event: SesEventRecord): Promise<SesEventProcessingResult> {
    const eventType = this.readString(event.eventType);
    if (!this.isOutboundEventType(eventType)) {
      signale.warn(`[SES_EVENTS] Unknown event type: ${eventType ?? 'missing'}`);
      return {status: 'ignored', message: 'Unknown event type'};
    }

    const messageId = this.readString(this.readRecord(event.mail)?.messageId);
    if (!messageId) {
      signale.warn('[SES_EVENTS] No messageId found in SNS notification');
      return {status: 'invalid', message: 'No messageId found'};
    }

    const email = await prisma.email.findUnique({
      where: {messageId},
      include: {contact: true, project: true},
    });

    if (!email) {
      signale.warn(`[SES_EVENTS] Email not found for messageId: ${messageId}`);
      return {status: 'ignored', message: 'Email not found'};
    }

    return this.applyOutboundEvent(event, eventType, email);
  }

  private static async applyOutboundEvent(
    event: SesEventRecord,
    eventType: 'Bounce' | 'Delivery' | 'Open' | 'Complaint' | 'Click',
    email: EmailWithContactAndProject,
  ): Promise<SesEventProcessingResult> {
    const now = new Date();
    const updateData: Prisma.EmailUpdateInput = {};
    const eventName = `email.${eventType.toLowerCase()}`;
    const baseEventData = {
      subject: email.subject,
      from: email.from,
      fromName: email.fromName,
      messageId: email.messageId,
      emailId: email.id,
      templateId: email.templateId,
      campaignId: email.campaignId,
      sourceType: email.sourceType,
    };
    let eventData: Record<string, unknown> = baseEventData;

    switch (eventType) {
      case 'Delivery':
        signale.success(`[SES_EVENTS] Delivery confirmed for ${email.contact.email} from ${email.project.name}`);
        updateData.status = EmailStatus.DELIVERED;
        updateData.deliveredAt = now;
        eventData = {...baseEventData, deliveredAt: now.toISOString()};
        break;

      case 'Open':
        signale.success(`[SES_EVENTS] Open received for ${email.contact.email} from ${email.project.name}`);
        if (!email.openedAt) {
          updateData.openedAt = now;
        }
        updateData.opens = email.opens + 1;
        updateData.status = EmailStatus.OPENED;
        eventData = {
          ...baseEventData,
          openedAt: email.openedAt?.toISOString() ?? now.toISOString(),
          opens: email.opens + 1,
          isFirstOpen: !email.openedAt,
        };
        break;

      case 'Click': {
        signale.success(`[SES_EVENTS] Click received for ${email.contact.email} from ${email.project.name}`);
        if (!email.clickedAt) {
          updateData.clickedAt = now;
        }
        updateData.clicks = email.clicks + 1;
        updateData.status = EmailStatus.CLICKED;
        eventData = {
          ...baseEventData,
          link: this.readString(this.readRecord(event.click)?.link),
          clickedAt: email.clickedAt?.toISOString() ?? now.toISOString(),
          clicks: email.clicks + 1,
          isFirstClick: !email.clickedAt,
        };
        break;
      }

      case 'Bounce':
        eventData = await this.applyBounce(event, email, now, updateData, baseEventData);
        break;

      case 'Complaint':
        signale.warn(`[SES_EVENTS] Complaint received for ${email.contact.email} from ${email.project.name}`);
        updateData.status = EmailStatus.COMPLAINED;
        updateData.complainedAt = now;
        await prisma.contact.update({where: {id: email.contactId}, data: {subscribed: false}});
        eventData = {...baseEventData, complainedAt: now.toISOString()};
        await NtfyService.notifyEmailComplaint(email.project.name, email.projectId, email.contact.email);
        break;
    }

    await prisma.email.update({where: {id: email.id}, data: updateData});
    await EventService.trackEvent(email.projectId, eventName, email.contactId, email.id, eventData);

    const isPermanentBounce =
      eventType === 'Bounce' && this.readString(this.readRecord(event.bounce)?.bounceType) === 'Permanent';
    if (isPermanentBounce || eventType === 'Complaint') {
      await SecurityService.checkAndEnforceSecurityLimits(email.projectId);
    }

    signale.success(`[SES_EVENTS] Processed ${eventType} event for email ${email.id}`);
    return {status: 'processed'};
  }

  private static async applyBounce(
    event: SesEventRecord,
    email: EmailWithContactAndProject,
    now: Date,
    updateData: Prisma.EmailUpdateInput,
    baseEventData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const bounceType = this.readString(this.readRecord(event.bounce)?.bounceType);
    const isPermanentBounce = bounceType === 'Permanent';
    const isTransientBounce = bounceType === 'Transient';

    if (isTransientBounce) {
      signale.info(
        `[SES_EVENTS] Transient bounce received for ${email.contact.email} from ${email.project.name} (not counted toward bounce rate)`,
      );
      return {...baseEventData, bounceType, transientBounce: true};
    }

    const warning = isPermanentBounce
      ? `[SES_EVENTS] Permanent bounce received for ${email.contact.email} from ${email.project.name}`
      : `[SES_EVENTS] Unknown bounce type (${bounceType}) received for ${email.contact.email} from ${email.project.name} - treating as permanent`;
    signale.warn(warning);

    updateData.status = EmailStatus.BOUNCED;
    updateData.bouncedAt = now;
    await prisma.contact.update({where: {id: email.contactId}, data: {subscribed: false}});
    await NtfyService.notifyEmailBounce(email.project.name, email.projectId, email.contact.email, bounceType);

    return {...baseEventData, bounceType, bouncedAt: now.toISOString()};
  }

  private static async parseInboundEmailBody(event: SesEventRecord): Promise<string | undefined> {
    if (typeof event.content !== 'string') {
      return undefined;
    }

    try {
      const isBase64 = this.readString(this.readRecord(this.readRecord(event.receipt)?.action)?.encoding) === 'BASE64';
      const emailBuffer = isBase64 ? Buffer.from(event.content, 'base64') : Buffer.from(event.content);
      const parsed = await simpleParser(emailBuffer);
      const raw = (parsed.html ? String(parsed.html) : undefined) ?? parsed.textAsHtml ?? parsed.text ?? undefined;

      if (!raw) {
        return undefined;
      }

      return sanitizeHtml(raw, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          'img': ['src', 'alt', 'width', 'height'],
          '*': ['style'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
      });
    } catch (error) {
      signale.error('[SES_EVENTS] Failed to parse email content:', error);
      return undefined;
    }
  }

  private static async claimMessage(messageId: string): Promise<boolean> {
    try {
      await prisma.sesEventMessage.create({data: {messageId}});
      return true;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return false;
      }

      throw error;
    }
  }

  private static async releaseMessage(messageId: string): Promise<void> {
    await prisma.sesEventMessage.delete({where: {messageId}});
  }

  private static isOutboundEventType(
    eventType: string | undefined,
  ): eventType is 'Bounce' | 'Delivery' | 'Open' | 'Complaint' | 'Click' {
    return (
      eventType === 'Bounce' ||
      eventType === 'Delivery' ||
      eventType === 'Open' ||
      eventType === 'Complaint' ||
      eventType === 'Click'
    );
  }

  private static readRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return undefined;
  }

  private static readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private static readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private static isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
