import {EmailStatus, WebhookEventStatus} from '@plunk/db';
import express, {json, raw, type NextFunction, type Request, type Response} from 'express';
import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {factories, getPrismaClient} from '../../../../../test/helpers/index.js';
import {HttpException} from '../../exceptions/index.js';
import {EmailService} from '../../services/EmailService.js';
import {PostalWebhooks} from '../PostalWebhooks.js';

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.DIRECT_DATABASE_URL =
    process.env.DIRECT_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.EMAIL_PROVIDER = 'postal';
  process.env.POSTAL_BASE_URL = 'https://postal.example.com';
  process.env.POSTAL_API_KEY = 'postal-key';
  const actual = await importOriginal<typeof import('../../app/constants.js')>();
  return {
    ...actual,
    EMAIL_PROVIDER_IS_POSTAL: true,
    POSTAL_WEBHOOK_SECRET: 'postal-secret',
    POSTAL_WEBHOOK_SIGNATURE_REQUIRED: true,
  };
});

function createWebhookApp() {
  const app = express();
  app.post(
    '/webhooks/postal/events',
    raw({type: 'application/json'}),
    (req: Request, res: Response, next: NextFunction) => {
      void PostalWebhooks.receiveEvents(req, res).catch(next);
    },
  );
  app.use(json());
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpException) {
      res.status(error.code).json({error: error.message});
      return;
    }

    res.status(500).json({error: error.message});
  });
  return app;
}

describe('PostalWebhooks event ingestion', () => {
  const app = createWebhookApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects requests without the configured secret', async () => {
    const response = await request(app).post('/webhooks/postal/events').send({event: 'delivered'}).expect(401);

    expect(response.body).toEqual({error: 'Invalid Postal webhook secret'});
  });

  it('correlates by Postal provider message id and records delivered event', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'postal-message-id',
    });
    const legacyHeaderEmail = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'legacy-header-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        id: 'postal-event-id',
        event: 'delivered',
        message: {
          message_id: 'postal-message-id',
          headers: {'X-Plunk-Email-ID': legacyHeaderEmail.id},
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);
    expect(updatedEmail.deliveredAt).toBeInstanceOf(Date);
    const unchangedLegacyHeaderEmail = await prisma.email.findUniqueOrThrow({where: {id: legacyHeaderEmail.id}});
    expect(unchangedLegacyHeaderEmail.status).toBe(EmailStatus.SENT);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'postal-event-id'}},
    });
    expect(event.status).toBe(WebhookEventStatus.PROCESSED);
  });

  it('uses legacy Plunk email header only after provider message id correlation fails', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'legacy-postal-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        id: 'postal-legacy-event-id',
        event: 'delivered',
        message: {
          message_id: 'missing-provider-message-id',
          headers: {'X-Plunk-Email-ID': email.id},
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'postal-legacy-event-id'}},
    });
    expect(event.emailId).toBe(email.id);
    expect(event.status).toBe(WebhookEventStatus.PROCESSED);
  });

  it('deduplicates repeated Postal events', async () => {
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'postal-message-id',
    });
    const payload = {
      id: 'duplicate-event-id',
      event: 'clicked',
      message_id: 'postal-message-id',
      url: 'https://example.com',
    };

    await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send(payload)
      .expect(200);

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 0, duplicate: 1, failed: 0});
  });

  it('processes Postal MessageSent wrappers using nested message ids and wrapper uuid dedupe', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: '1fd8d665-b936-4a0d-8f99-a184d0a4e18e@rp.mailserver.bvgroup.co',
    });
    const payload = {
      event: 'MessageSent',
      timestamp: 1781470966.8299234,
      uuid: 'postal-wrapper-sent-uuid',
      payload: {
        message: {
          id: 1,
          token: 'cjr2N4G6oexfUxG3',
          direction: 'outgoing',
          message_id: '1fd8d665-b936-4a0d-8f99-a184d0a4e18e@rp.mailserver.bvgroup.co',
          to: 'vitalii@bvgroup.co',
          from: 'hello@agyn.org',
          subject: '[TEST] Update',
          timestamp: 1781470963.4924512,
          spam_status: 'NotChecked',
          tag: null,
        },
        status: 'Sent',
        details: 'Message for vitalii@bvgroup.co accepted by 91.99.251.254:25 (mail.bvgroup.co) (from 49.13.110.99)',
        output: '250 2.0.0 Ok: queued as 639EFC002B',
        sent_with_ssl: true,
        timestamp: 1781470966.8299234,
        time: 0.91,
      },
    };

    const firstResponse = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send(payload)
      .expect(200);
    const secondResponse = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send(payload)
      .expect(200);

    expect(firstResponse.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});
    expect(secondResponse.body).toEqual({success: true, processed: 0, duplicate: 1, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);
    expect(updatedEmail.deliveredAt).toBeInstanceOf(Date);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'postal-wrapper-sent-uuid'}},
    });
    expect(event.event).toBe('sent');
    expect(event.status).toBe(WebhookEventStatus.PROCESSED);
  });

  it('processes Postal MessageLoaded wrappers as opened events', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.DELIVERED,
      messageId: 'loaded-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        event: 'MessageLoaded',
        uuid: 'postal-wrapper-loaded-uuid',
        payload: {
          message: {message_id: 'loaded-message-id'},
          token: 'loaded-tracking-token',
          ip_address: '203.0.113.10',
          user_agent: 'Mozilla/5.0 Postal test',
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.OPENED);
    expect(updatedEmail.opens).toBe(1);
    expect(updatedEmail.openedAt).toBeInstanceOf(Date);

    const event = await prisma.event.findFirstOrThrow({where: {emailId: email.id, name: 'email.opened'}});
    expect(event.data).toEqual({
      provider: 'postal',
      token: 'loaded-tracking-token',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 Postal test',
    });
  });

  it('processes Postal MessageLinkClicked wrappers with nested click metadata', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.OPENED,
      messageId: 'clicked-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        event: 'MessageLinkClicked',
        uuid: 'postal-wrapper-clicked-uuid',
        payload: {
          message: {token: 'clicked-message-id'},
          url: 'https://example.com/newsletter',
          token: 'clicked-tracking-token',
          ip_address: '203.0.113.11',
          user_agent: 'Mozilla/5.0 Postal click test',
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.CLICKED);
    expect(updatedEmail.clicks).toBe(1);
    expect(updatedEmail.clickedAt).toBeInstanceOf(Date);

    const event = await prisma.event.findFirstOrThrow({where: {emailId: email.id, name: 'email.clicked'}});
    expect(event.data).toEqual({
      provider: 'postal',
      url: 'https://example.com/newsletter',
      token: 'clicked-tracking-token',
      ipAddress: '203.0.113.11',
      userAgent: 'Mozilla/5.0 Postal click test',
    });
  });

  it('does not use top-level Postal click tokens for email correlation', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.OPENED,
      messageId: 'clicked-link-token',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        event: 'MessageLinkClicked',
        uuid: 'postal-wrapper-clicked-link-token-uuid',
        payload: {
          token: 'clicked-link-token',
          url: 'https://example.com/newsletter',
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 0, duplicate: 0, failed: 1});

    const unchangedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(unchangedEmail.status).toBe(EmailStatus.OPENED);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'postal-wrapper-clicked-link-token-uuid'}},
    });
    expect(event.emailId).toBeNull();
    expect(event.status).toBe(WebhookEventStatus.FAILED);
    expect(event.error).toBe('Could not correlate Postal event to a Plunk email');
  });

  it('maps Postal MessageDeliveryFailed MessageBounced and MessageHeld wrappers to failure statuses', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const failedEmail = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'failed-message-id',
    });
    const bouncedEmail = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'bounced-message-id',
    });
    const heldEmail = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'held-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send([
        {
          event: 'MessageDeliveryFailed',
          uuid: 'postal-wrapper-failed-uuid',
          payload: {message: {message_id: 'failed-message-id'}, details: 'SMTP timeout', output: '451 timeout'},
        },
        {
          event: 'MessageBounced',
          uuid: 'postal-wrapper-bounced-uuid',
          payload: {
            original_message: {message_id: 'bounced-message-id'},
            bounce: {message_id: 'bounce-notification-message-id'},
            status: 'HardFail',
            details: 'User unknown',
          },
        },
        {
          event: 'MessageHeld',
          uuid: 'postal-wrapper-held-uuid',
          payload: {message: {message_id: 'held-message-id'}, status: 'Held', details: 'Message held for review'},
        },
      ])
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 3, duplicate: 0, failed: 0});

    const updatedFailedEmail = await prisma.email.findUniqueOrThrow({where: {id: failedEmail.id}});
    const updatedBouncedEmail = await prisma.email.findUniqueOrThrow({where: {id: bouncedEmail.id}});
    const updatedHeldEmail = await prisma.email.findUniqueOrThrow({where: {id: heldEmail.id}});
    expect(updatedFailedEmail.status).toBe(EmailStatus.FAILED);
    expect(updatedFailedEmail.error).toBe('SMTP timeout');
    expect(updatedBouncedEmail.status).toBe(EmailStatus.BOUNCED);
    expect(updatedBouncedEmail.bouncedAt).toBeInstanceOf(Date);
    expect(updatedHeldEmail.status).toBe(EmailStatus.FAILED);
    expect(updatedHeldEmail.error).toBe('Message held for review');
  });

  it('explicitly records Postal MessageDelayed wrappers as ignored events', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'delayed-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        event: 'MessageDelayed',
        uuid: 'postal-wrapper-delayed-uuid',
        payload: {
          message: {message_id: 'delayed-message-id'},
          status: 'Held',
          details: 'Message delivery was delayed and will be retried by Postal',
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 0, duplicate: 0, failed: 0});

    const unchangedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(unchangedEmail.status).toBe(EmailStatus.SENT);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'postal-wrapper-delayed-uuid'}},
    });
    expect(event.event).toBe('delayed');
    expect(event.emailId).toBeNull();
    expect(event.status).toBe(WebhookEventStatus.IGNORED);
  });

  it('does not dedupe a failed side effect before a retry succeeds', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'retry-message-id',
    });
    const payload = {id: 'retry-event-id', event: 'delivered', message_id: 'retry-message-id'};

    vi.spyOn(EmailService, 'handleWebhookEvent').mockRejectedValueOnce(new Error('Email update failed'));

    await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send(payload)
      .expect(500);

    const failedEvent = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'retry-event-id'}},
    });
    expect(failedEvent.status).toBe(WebhookEventStatus.FAILED);
    expect(failedEvent.error).toBe('Email update failed');

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'retry-event-id'}},
    });
    expect(event.status).toBe(WebhookEventStatus.PROCESSED);
  });
});
