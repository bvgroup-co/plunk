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
  process.env.EMAIL_PROVIDER = 'postal';
  process.env.POSTAL_BASE_URL = 'https://postal.example.com';
  process.env.POSTAL_API_KEY = 'postal-key';
  process.env.POSTAL_CNAME_VALUE = 'postal-cname.example.com';
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

  it('correlates by Plunk email header and records delivered event', async () => {
    const prisma = getPrismaClient();
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail(project.id, contact.id, {
      status: EmailStatus.SENT,
      messageId: 'postal-message-id',
    });

    const response = await request(app)
      .post('/webhooks/postal/events')
      .set('X-Plunk-Postal-Webhook-Secret', 'postal-secret')
      .send({
        id: 'postal-event-id',
        event: 'delivered',
        message: {
          id: 'postal-message-id',
          headers: {'X-Plunk-Email-ID': email.id},
        },
      })
      .expect(200);

    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);
    expect(updatedEmail.deliveredAt).toBeInstanceOf(Date);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'POSTAL', providerEventId: 'postal-event-id'}},
    });
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
