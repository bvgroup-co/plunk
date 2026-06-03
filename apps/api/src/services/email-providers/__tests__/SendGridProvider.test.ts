import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SendGridProvider} from '../SendGridProvider.js';

vi.mock('../../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.DIRECT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.EMAIL_PROVIDER = 'sendgrid';
  process.env.SENDGRID_API_KEY = 'sendgrid-key';
  const actual = await importOriginal<typeof import('../../../app/constants.js')>();
  return {
    ...actual,
    SENDGRID_API_KEY: 'sendgrid-api-key',
    SENDGRID_ON_BEHALF_OF: 'sendgrid-subuser',
    SENDGRID_REGION: 'eu',
    SENDGRID_SANDBOX_MODE: true,
  };
});

describe('SendGridProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(
      async () => new Response(null, {status: 202, headers: {'x-message-id': 'sendgrid-message-id'}}),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps outbound email input to SendGrid mail send payload', async () => {
    const provider = new SendGridProvider();

    const result = await provider.sendEmail({
      from: {name: 'Sender', email: 'sender@example.com'},
      to: [{name: 'Recipient', email: 'recipient@example.com'}],
      subject: 'Subject',
      html: '<p>Hello</p><a href="http://localhost:3000/unsubscribe/contact-id">unsubscribe</a>',
      reply: 'reply@example.com',
      headers: {'X-Custom': 'value'},
      attachments: [
        {
          filename: 'file.txt',
          content: 'SGVsbG8=',
          contentType: 'text/plain',
        },
      ],
      tracking: false,
      emailId: 'email-id',
      projectId: 'project-id',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.eu.sendgrid.com/v3/mail/send',
      expect.objectContaining({method: 'POST'}),
    );
    const headers = vi.mocked(global.fetch).mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get('On-Behalf-Of')).toBe('sendgrid-subuser');
    expect(JSON.parse(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body as string)).toEqual({
      from: {name: 'Sender', email: 'sender@example.com'},
      to: [{name: 'Recipient', email: 'recipient@example.com'}],
      subject: 'Subject',
      html: '<p>Hello</p><a href="http://localhost:3000/unsubscribe/contact-id">unsubscribe</a>',
      replyTo: {email: 'reply@example.com'},
      headers: {
        'X-Custom': 'value',
        'List-Unsubscribe': '<http://localhost:3000/unsubscribe/contact-id>',
      },
      attachments: [
        {
          content: 'SGVsbG8=',
          filename: 'file.txt',
          type: 'text/plain',
          disposition: 'attachment',
        },
      ],
      customArgs: {
        plunk_email_id: 'email-id',
        plunk_project_id: 'project-id',
      },
      mailSettings: {
        sandboxMode: {
          enable: true,
        },
      },
      trackingSettings: {
        clickTracking: {
          enable: false,
          enableText: false,
        },
        openTracking: {
          enable: false,
        },
      },
    });
    expect(result).toEqual({provider: 'sendgrid', messageId: 'sendgrid-message-id'});
  });

  it('enables SendGrid open and click tracking when requested', async () => {
    const provider = new SendGridProvider();

    await provider.sendEmail({
      from: {email: 'sender@example.com'},
      to: [{email: 'recipient@example.com'}],
      subject: 'Subject',
      html: '<p>Hello</p>',
      tracking: true,
    });

    expect(JSON.parse(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        trackingSettings: {
          clickTracking: {
            enable: true,
            enableText: true,
          },
          openTracking: {
            enable: true,
          },
        },
      }),
    );
  });
});
