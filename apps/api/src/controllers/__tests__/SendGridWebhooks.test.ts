import {EmailStatus, WebhookEventStatus} from '@plunk/db';
import express, {json, raw, type NextFunction, type Request, type Response} from 'express';
import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {factories, getPrismaClient} from '../../../../../test/helpers/index.js';
import {HttpException} from '../../exceptions/index.js';
import {SendGridWebhooks} from '../SendGridWebhooks.js';

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.EMAIL_PROVIDER = 'sendgrid';
  process.env.SENDGRID_API_KEY = 'sendgrid-key';
  const actual = await importOriginal<typeof import('../../app/constants.js')>();
  return {
    ...actual,
    EMAIL_PROVIDER_IS_SENDGRID: true,
    SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY: '',
    SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED: false,
  };
});

function createWebhookApp() {
  const app = express();
  app.post(
    '/webhooks/sendgrid/events',
    raw({type: 'application/json'}),
    (req: Request, res: Response, next: NextFunction) => {
      void SendGridWebhooks.receiveEvents(req, res).catch(next);
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

describe('SendGridWebhooks raw body handling', () => {
  it('receives raw bytes when the route raw parser runs before global json parsing', async () => {
    const response = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([{event: 'processed', sg_event_id: 'ignored-event-id'}]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 0, duplicate: 0, failed: 0});
  });
});

describe('SendGridWebhooks event ingestion', () => {
  const prisma = getPrismaClient();
  let projectId: string;
  let contactId: string;

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'SendGrid Webhook Project'});
    projectId = project.id;
    const contact = await factories.createContact({projectId, subscribed: true});
    contactId = contact.id;
  });

  it('updates delivery status and records the provider event by Plunk email id', async () => {
    const email = await factories.createEmail({
      projectId,
      contactId,
      status: EmailStatus.SENT,
      messageId: 'sendgrid-message-id',
    });

    const response = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([
        {
          event: 'delivered',
          sg_event_id: 'delivered-event-id',
          sg_message_id: 'sendgrid-message-id.filter0001',
          custom_args: {plunk_email_id: email.id},
        },
      ]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const delivered = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(delivered.status).toBe(EmailStatus.DELIVERED);
    expect(delivered.deliveredAt).toBeInstanceOf(Date);

    const providerEvent = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'SENDGRID', providerEventId: 'delivered-event-id'}},
    });
    expect(providerEvent.emailId).toBe(email.id);
    expect(providerEvent.status).toBe(WebhookEventStatus.PROCESSED);
  });

  it('correlates events by normalized SendGrid message id', async () => {
    const email = await factories.createEmail({
      projectId,
      contactId,
      status: EmailStatus.DELIVERED,
      messageId: 'normalized-message-id',
    });

    const response = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([
        {
          event: 'open',
          sg_event_id: 'open-event-id',
          sg_message_id: 'normalized-message-id.filter0001',
        },
      ]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const opened = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(opened.status).toBe(EmailStatus.OPENED);
    expect(opened.opens).toBe(1);
    expect(opened.openedAt).toBeInstanceOf(Date);
  });

  it('deduplicates provider events before applying webhook effects', async () => {
    const email = await factories.createEmail({
      projectId,
      contactId,
      status: EmailStatus.SENT,
      messageId: 'duplicate-message-id',
    });
    const payload = {
      event: 'click',
      sg_event_id: 'duplicate-click-event-id',
      sg_message_id: 'duplicate-message-id',
      custom_args: {plunk_email_id: email.id},
      url: 'https://example.com',
    };

    const firstResponse = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([payload]);
    const secondResponse = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([payload]);

    expect(firstResponse.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});
    expect(secondResponse.body).toEqual({success: true, processed: 0, duplicate: 1, failed: 0});

    const clicked = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(clicked.status).toBe(EmailStatus.CLICKED);
    expect(clicked.clicks).toBe(1);

    const providerEvents = await prisma.providerWebhookEvent.findMany({
      where: {provider: 'SENDGRID', providerEventId: 'duplicate-click-event-id'},
    });
    expect(providerEvents).toHaveLength(1);
  });

  it('does not regress terminal status when later engagement events arrive', async () => {
    const email = await factories.createEmail({
      projectId,
      contactId,
      status: EmailStatus.CLICKED,
      messageId: 'terminal-message-id',
      clicks: 1,
      clickedAt: new Date(),
    });

    const response = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([
        {
          event: 'open',
          sg_event_id: 'late-open-event-id',
          sg_message_id: 'terminal-message-id',
          custom_args: {plunk_email_id: email.id},
        },
      ]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const unchanged = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(unchanged.status).toBe(EmailStatus.CLICKED);
    expect(unchanged.opens).toBe(0);
    expect(unchanged.clicks).toBe(1);
  });

  it('unsubscribes contacts from unsubscribe events', async () => {
    const email = await factories.createEmail({
      projectId,
      contactId,
      status: EmailStatus.DELIVERED,
      messageId: 'unsubscribe-message-id',
    });

    const response = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([
        {
          event: 'group_unsubscribe',
          sg_event_id: 'group-unsubscribe-event-id',
          sg_message_id: 'unsubscribe-message-id',
          custom_args: {plunk_email_id: email.id},
        },
      ]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 1, duplicate: 0, failed: 0});

    const contact = await prisma.contact.findUniqueOrThrow({where: {id: contactId}});
    expect(contact.subscribed).toBe(false);

    const unsubscribeEvent = await prisma.event.findFirstOrThrow({
      where: {emailId: email.id, name: 'email.unsubscribed'},
    });
    expect(unsubscribeEvent.data).toEqual({provider: 'sendgrid'});
  });

  it('records failed provider events when an actionable event cannot be correlated', async () => {
    const response = await request(createWebhookApp())
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([{event: 'bounce', sg_event_id: 'uncorrelated-bounce-event-id'}]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 0, duplicate: 0, failed: 1});

    const providerEvent = await prisma.providerWebhookEvent.findUniqueOrThrow({
      where: {provider_providerEventId: {provider: 'SENDGRID', providerEventId: 'uncorrelated-bounce-event-id'}},
    });
    expect(providerEvent.emailId).toBeNull();
    expect(providerEvent.status).toBe(WebhookEventStatus.FAILED);
    expect(providerEvent.error).toBe('SendGrid event does not contain a provider message ID');
  });
});
