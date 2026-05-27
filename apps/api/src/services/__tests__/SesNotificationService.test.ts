import {EmailStatus, SesNotificationStatus} from '@plunk/db';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {factories, getPrismaClient} from '../../../../../test/helpers';
import {SesNotificationService} from '../SesNotificationService';

vi.mock('../../database/redis', () => ({
  redis: {
    get: vi.fn(async () => null),
    setex: vi.fn(async () => 'OK'),
    exists: vi.fn(async () => 0),
    incr: vi.fn(async () => 1),
    del: vi.fn(async () => 1),
  },
}));

vi.mock('../NtfyService', () => ({
  NtfyService: {
    notifyEmailBounce: vi.fn(async () => undefined),
    notifyEmailComplaint: vi.fn(async () => undefined),
  },
}));

describe('SesNotificationService', () => {
  const prisma = getPrismaClient();
  let projectId: string;
  let contactId: string;
  let emailId: string;

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
    const contact = await factories.createContact({projectId, email: 'recipient@example.com'});
    contactId = contact.id;
    const email = await factories.createEmail({
      projectId,
      contactId,
      messageId: 'ses-message-id',
      status: EmailStatus.SENT,
    });
    emailId = email.id;
  });

  it('processes outbound SES events from an SNS notification', async () => {
    await SesNotificationService.processSnsNotification({
      MessageId: 'sns-message-id',
      Message: JSON.stringify({
        eventType: 'Delivery',
        mail: {
          messageId: 'ses-message-id',
        },
      }),
    });

    const email = await prisma.email.findUniqueOrThrow({where: {id: emailId}});
    expect(email.status).toBe(EmailStatus.DELIVERED);
    expect(email.deliveredAt).toBeInstanceOf(Date);

    const event = await prisma.event.findFirstOrThrow({where: {emailId}});
    expect(event.name).toBe('email.delivery');

    const notification = await prisma.sesNotification.findUniqueOrThrow({where: {snsMessageId: 'sns-message-id'}});
    expect(notification.status).toBe(SesNotificationStatus.PROCESSED);
  });

  it('dedupes already processed SNS message IDs', async () => {
    const snsNotification = {
      MessageId: 'duplicate-sns-message-id',
      Message: JSON.stringify({
        eventType: 'Open',
        mail: {
          messageId: 'ses-message-id',
        },
      }),
    };

    await SesNotificationService.processSnsNotification(snsNotification);
    const duplicateResult = await SesNotificationService.processSnsNotification(snsNotification);

    expect(duplicateResult).toEqual({success: true, message: 'Duplicate notification skipped', duplicate: true});

    const email = await prisma.email.findUniqueOrThrow({where: {id: emailId}});
    expect(email.opens).toBe(1);

    const events = await prisma.event.findMany({where: {emailId, name: 'email.open'}});
    expect(events).toHaveLength(1);
  });

  it('can retry failed SNS message IDs successfully', async () => {
    await prisma.sesNotification.create({
      data: {
        snsMessageId: 'failed-sns-message-id',
        status: SesNotificationStatus.FAILED,
        error: 'previous failure',
      },
    });

    const result = await SesNotificationService.processSnsNotification({
      MessageId: 'failed-sns-message-id',
      Message: JSON.stringify({
        eventType: 'Click',
        mail: {
          messageId: 'ses-message-id',
        },
        click: {
          link: 'https://example.com',
        },
      }),
    });

    expect(result).toEqual({success: true});

    const email = await prisma.email.findUniqueOrThrow({where: {id: emailId}});
    expect(email.clicks).toBe(1);

    const notification = await prisma.sesNotification.findUniqueOrThrow({
      where: {snsMessageId: 'failed-sns-message-id'},
    });
    expect(notification.status).toBe(SesNotificationStatus.PROCESSED);
    expect(notification.error).toBeNull();
  });

  it('marks failed notifications for retry without double-processing', async () => {
    const snsNotification = {
      MessageId: 'retryable-sns-message-id',
      Message: JSON.stringify({
        eventType: 'Open',
        mail: {
          messageId: 'missing-ses-message-id',
        },
      }),
    };

    const result = await SesNotificationService.processSnsNotification(snsNotification);

    expect(result).toEqual({success: false, statusCode: 404, message: 'Email not found'});

    const notification = await prisma.sesNotification.findUniqueOrThrow({
      where: {snsMessageId: 'retryable-sns-message-id'},
    });
    expect(notification.status).toBe(SesNotificationStatus.FAILED);
  });
});
