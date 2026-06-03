import express, {json, raw} from 'express';
import request from 'supertest';
import {describe, expect, it, vi} from 'vitest';

import {SendGridWebhooks} from '../SendGridWebhooks.js';

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.DIRECT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/plunk_test';
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

describe('SendGridWebhooks raw body handling', () => {
  it('receives raw bytes when the route raw parser runs before global json parsing', async () => {
    const app = express();
    app.post('/webhooks/sendgrid/events', raw({type: 'application/json'}), SendGridWebhooks.receiveEvents);
    app.use(json());

    const response = await request(app)
      .post('/webhooks/sendgrid/events')
      .set('Content-Type', 'application/json')
      .send([{event: 'processed', sg_event_id: 'ignored-event-id'}]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({success: true, processed: 0, duplicate: 0, failed: 0});
  });
});
