import type {Prisma} from '@plunk/db';
import {EmailSourceType, EmailStatus, SesNotificationStatus} from '@plunk/db';
import {Prisma as PrismaNamespace} from '@plunk/db';
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

interface SnsNotification {
  MessageId?: string;
  Message?: string;
}

interface SesNotificationBody {
  notificationType?: string;
  eventType?: 'Bounce' | 'Delivery' | 'Open' | 'Complaint' | 'Click';
  mail?: {
    messageId?: string;
    source?: string;
    timestamp?: string;
    commonHeaders?: {
      from?: string[];
      subject?: string;
    };
  };
  receipt?: {
    recipients?: unknown[];
    action?: {
      encoding?: string;
    };
    spamVerdict?: {status?: string};
    virusVerdict?: {status?: string};
    spfVerdict?: {status?: string};
    dkimVerdict?: {status?: string};
    dmarcVerdict?: {status?: string};
    processingTimeMillis?: number;
  };
  content?: unknown;
  bounce?: {
    bounceType?: string;
  };
  click?: {
    link?: string;
  };
}

export type SesNotificationProcessResult =
  | {success: true; message?: string; duplicate?: boolean}
  | {success: false; statusCode: number; message: string};

export class SesNotificationProcessingError extends Error {}

export class SesNotificationService {
  public static async processSnsNotification(snsNotification: SnsNotification): Promise<SesNotificationProcessResult> {
    const snsMessageId = snsNotification.MessageId;

    if (snsMessageId) {
      const dedupeResult = await this.reserveNotification(snsMessageId);
      if (dedupeResult === 'processed') {
        signale.info(`[SES] Duplicate SNS notification skipped: ${snsMessageId}`);
        return {success: true, message: 'Duplicate notification skipped', duplicate: true};
      }
      if (dedupeResult === 'processing') {
        throw new SesNotificationProcessingError(`SNS notification is already processing: ${snsMessageId}`);
      }
    }

    try {
      const body = this.parseSesMessage(snsNotification);
      const result = await this.processSesBody(body);

      if (snsMessageId) {
        await prisma.sesNotification.update({
          where: {snsMessageId},
          data: result.success
            ? {
                status: SesNotificationStatus.PROCESSED,
                error: null,
                processedAt: new Date(),
              }
            : {
                status: SesNotificationStatus.FAILED,
                error: result.message,
              },
        });
      }

      return result;
    } catch (error) {
      if (snsMessageId) {
        await prisma.sesNotification.update({
          where: {snsMessageId},
          data: {
            status: SesNotificationStatus.FAILED,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
      throw error;
    }
  }

  private static async reserveNotification(snsMessageId: string): Promise<'reserved' | 'processed' | 'processing'> {
    try {
      await prisma.sesNotification.create({
        data: {
          snsMessageId,
          status: SesNotificationStatus.PROCESSING,
        },
      });
      return 'reserved';
    } catch (error) {
      if (!(error instanceof PrismaNamespace.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }

    const notification = await prisma.sesNotification.findUniqueOrThrow({where: {snsMessageId}});

    if (notification.status === SesNotificationStatus.PROCESSED) {
      return 'processed';
    }

    if (notification.status === SesNotificationStatus.PROCESSING) {
      return 'processing';
    }

    await prisma.sesNotification.update({
      where: {snsMessageId},
      data: {
        status: SesNotificationStatus.PROCESSING,
        error: null,
      },
    });
    return 'reserved';
  }

  private static parseSesMessage(snsNotification: SnsNotification): SesNotificationBody {
    if (typeof snsNotification.Message !== 'string') {
      throw new SesNotificationProcessingError('SNS notification missing Message field');
    }

    return JSON.parse(snsNotification.Message) as SesNotificationBody;
  }

  private static async processSesBody(body: SesNotificationBody): Promise<SesNotificationProcessResult> {
    if (body.notificationType === 'Received') {
      signale.info('[SES] Received inbound email notification from SES');
      await this.processInboundEmail(body);
      return {success: true, message: 'Inbound email processed'};
    }

    return this.processOutboundEmailEvent(body);
  }

  private static async processInboundEmail(body: SesNotificationBody): Promise<void> {
    const recipients = body.receipt?.recipients || [];

    if (recipients.length === 0) {
      signale.warn('[SES] No recipients found in inbound email');
      return;
    }

    for (const recipient of recipients) {
      if (typeof recipient !== 'string') {
        signale.warn('[SES] Invalid recipient email format:', recipient);
        continue;
      }

      const domain = recipient.split('@')[1];

      if (!domain) {
        signale.warn('[SES] Invalid recipient email format:', recipient);
        continue;
      }

      const domainRecords = await prisma.domain.findMany({
        where: {
          domain,
          verified: true,
        },
        include: {
          project: true,
        },
      });

      if (domainRecords.length === 0) {
        signale.info(`[SES] No verified domain found for: ${domain}`);
        continue;
      }

      signale.info(
        `[SES] Found ${domainRecords.length} project(s) with verified domain ${domain}. Processing inbound email for all.`,
      );

      const senderEmail = body.mail?.source;
      const senderFromHeader = body.mail?.commonHeaders?.from?.[0] || senderEmail;
      const htmlBody = await this.parseInboundEmailHtml(body);

      for (const domainRecord of domainRecords) {
        signale.info(`[SES] Processing inbound email for project: ${domainRecord.project.name}`);

        const limitCheck = await BillingLimitService.checkLimit(domainRecord.projectId, EmailSourceType.INBOUND);

        if (!limitCheck.allowed) {
          signale.warn(`[SES] Inbound email blocked for project ${domainRecord.project.name}: ${limitCheck.message}`);
          continue;
        }

        if (!senderEmail) {
          throw new SesNotificationProcessingError('Inbound email notification missing sender');
        }

        const contact = await ContactService.upsert(domainRecord.projectId, senderEmail, undefined, true);

        const inboundEmail = await prisma.email.create({
          data: {
            projectId: domainRecord.projectId,
            contactId: contact.id,
            subject: body.mail?.commonHeaders?.subject || '(No subject)',
            body: htmlBody || '',
            from: recipient,
            sourceType: EmailSourceType.INBOUND,
            status: EmailStatus.RECEIVED,
            deliveredAt: new Date(body.mail?.timestamp || new Date()),
          },
        });

        await BillingLimitService.incrementUsage(domainRecord.projectId, EmailSourceType.INBOUND);

        if (domainRecord.project.customer) {
          await MeterService.recordEmailSent(domainRecord.project.customer, 1, `email_${inboundEmail.id}`);
        }

        await EventService.trackEvent(domainRecord.projectId, 'email.received', contact.id, inboundEmail.id, {
          messageId: body.mail?.messageId,
          from: senderEmail,
          fromHeader: senderFromHeader,
          to: recipient,
          subject: body.mail?.commonHeaders?.subject,
          timestamp: body.mail?.timestamp,
          recipients: body.receipt?.recipients,
          hasContent: !!body.content,
          body: htmlBody,
          spamVerdict: body.receipt?.spamVerdict?.status,
          virusVerdict: body.receipt?.virusVerdict?.status,
          spfVerdict: body.receipt?.spfVerdict?.status,
          dkimVerdict: body.receipt?.dkimVerdict?.status,
          dmarcVerdict: body.receipt?.dmarcVerdict?.status,
          processingTimeMillis: body.receipt?.processingTimeMillis,
        });

        signale.success(
          `[SES] Created email.received event for ${senderEmail} -> ${recipient} (project: ${domainRecord.project.name})`,
        );
      }
    }
  }

  private static async parseInboundEmailHtml(body: SesNotificationBody): Promise<string | undefined> {
    if (!body.content || typeof body.content !== 'string') {
      return undefined;
    }

    try {
      const isBase64 = body.receipt?.action?.encoding === 'BASE64';
      const emailBuffer = isBase64 ? Buffer.from(body.content, 'base64') : Buffer.from(body.content);
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
      signale.error('[SES] Failed to parse email content:', error);
      return undefined;
    }
  }

  private static async processOutboundEmailEvent(body: SesNotificationBody): Promise<SesNotificationProcessResult> {
    const eventType = body.eventType;
    const messageId = body.mail?.messageId;

    if (!messageId) {
      signale.warn('[SES] No messageId found in SNS notification');
      return {success: false, statusCode: 400, message: 'No messageId found'};
    }

    const email = await prisma.email.findUnique({
      where: {messageId},
      include: {
        contact: true,
        project: true,
      },
    });

    if (!email) {
      signale.warn(`[SES] Email not found for messageId: ${messageId}`);
      return {success: false, statusCode: 404, message: 'Email not found'};
    }

    const now = new Date();
    const updateData: Prisma.EmailUpdateInput = {};
    const eventName = `email.${eventType?.toLowerCase()}`;

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
        signale.success(`[SES] Delivery confirmed for ${email.contact.email} from ${email.project.name}`);
        updateData.status = EmailStatus.DELIVERED;
        updateData.deliveredAt = now;
        eventData = {
          ...baseEventData,
          deliveredAt: now.toISOString(),
        };
        break;

      case 'Open':
        signale.success(`[SES] Open received for ${email.contact.email} from ${email.project.name}`);
        if (!email.openedAt) {
          updateData.openedAt = now;
        }
        updateData.opens = (email.opens || 0) + 1;
        updateData.status = EmailStatus.OPENED;
        eventData = {
          ...baseEventData,
          openedAt: email.openedAt?.toISOString() || now.toISOString(),
          opens: (email.opens || 0) + 1,
          isFirstOpen: !email.openedAt,
        };
        break;

      case 'Click': {
        signale.success(`[SES] Click received for ${email.contact.email} from ${email.project.name}`);
        const clickedLink = body.click?.link;
        if (!email.clickedAt) {
          updateData.clickedAt = now;
        }
        updateData.clicks = (email.clicks || 0) + 1;
        updateData.status = EmailStatus.CLICKED;
        eventData = {
          ...baseEventData,
          link: clickedLink,
          clickedAt: email.clickedAt?.toISOString() || now.toISOString(),
          clicks: (email.clicks || 0) + 1,
          isFirstClick: !email.clickedAt,
        };
        break;
      }

      case 'Bounce': {
        const bounceType = body.bounce?.bounceType;
        const isPermanentBounce = bounceType === 'Permanent';
        const isTransientBounce = bounceType === 'Transient';

        if (isPermanentBounce) {
          signale.warn(`[SES] Permanent bounce received for ${email.contact.email} from ${email.project.name}`);
          updateData.status = EmailStatus.BOUNCED;
          updateData.bouncedAt = now;
          await prisma.contact.update({
            where: {id: email.contactId},
            data: {subscribed: false},
          });
          eventData = {
            ...baseEventData,
            bounceType,
            bouncedAt: now.toISOString(),
          };

          await NtfyService.notifyEmailBounce(email.project.name, email.projectId, email.contact.email, bounceType);
        } else if (isTransientBounce) {
          signale.info(
            `[SES] Transient bounce received for ${email.contact.email} from ${email.project.name} (not counted toward bounce rate)`,
          );
          eventData = {
            ...baseEventData,
            bounceType,
            transientBounce: true,
          };
        } else {
          signale.warn(
            `[SES] Unknown bounce type (${bounceType}) received for ${email.contact.email} from ${email.project.name} - treating as permanent`,
          );
          updateData.status = EmailStatus.BOUNCED;
          updateData.bouncedAt = now;
          await prisma.contact.update({
            where: {id: email.contactId},
            data: {subscribed: false},
          });
          eventData = {
            ...baseEventData,
            bounceType,
            bouncedAt: now.toISOString(),
          };

          await NtfyService.notifyEmailBounce(email.project.name, email.projectId, email.contact.email, bounceType);
        }
        break;
      }

      case 'Complaint':
        signale.warn(`[SES] Complaint received for ${email.contact.email} from ${email.project.name}`);
        updateData.status = EmailStatus.COMPLAINED;
        updateData.complainedAt = now;
        await prisma.contact.update({
          where: {id: email.contactId},
          data: {subscribed: false},
        });
        eventData = {
          ...baseEventData,
          complainedAt: now.toISOString(),
        };

        await NtfyService.notifyEmailComplaint(email.project.name, email.projectId, email.contact.email);
        break;

      default:
        signale.warn(`[SES] Unknown event type: ${eventType}`);
        return {success: true};
    }

    await prisma.email.update({
      where: {id: email.id},
      data: updateData,
    });

    await EventService.trackEvent(email.projectId, eventName, email.contactId, email.id, eventData);

    const isPermanentBounce = eventType === 'Bounce' && body.bounce?.bounceType === 'Permanent';
    if (isPermanentBounce || eventType === 'Complaint') {
      await SecurityService.checkAndEnforceSecurityLimits(email.projectId);
    }

    signale.success(`[SES] Processed ${eventType} event for email ${email.id}`);
    return {success: true};
  }
}
