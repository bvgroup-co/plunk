import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {formatPostalAddress, PostalProvider} from '../PostalProvider.js';

vi.mock('../../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.EMAIL_PROVIDER = 'postal';
  process.env.POSTAL_BASE_URL = 'https://postal.example.com/';
  process.env.POSTAL_API_KEY = 'postal-key';
  const actual = await importOriginal<typeof import('../../../app/constants.js')>();
  return {
    ...actual,
    POSTAL_API_KEY: 'postal-api-key',
    POSTAL_BASE_URL: 'https://postal.example.com/',
  };
});

describe('PostalProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({message_id: 'postal-message-id'}), {status: 200}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps outbound email input to Postal send payload', async () => {
    const provider = new PostalProvider();

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
          contentId: 'file-id',
        },
      ],
      tracking: false,
      emailId: 'email-id',
      projectId: 'project-id',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://postal.example.com/api/v1/send/message',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Server-API-Key': 'postal-api-key',
        },
      }),
    );
    expect(JSON.parse(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body as string)).toEqual({
      to: ['"Recipient" <recipient@example.com>'],
      from: '"Sender" <sender@example.com>',
      subject: 'Subject',
      html_body: '<p>Hello</p><a href="http://localhost:3000/unsubscribe/contact-id">unsubscribe</a>',
      reply_to: 'reply@example.com',
      headers: {
        'X-Custom': 'value',
        'List-Unsubscribe': '<http://localhost:3000/unsubscribe/contact-id>',
        'X-Plunk-Email-ID': 'email-id',
        'X-Plunk-Project-ID': 'project-id',
        'X-AMP': 'skip',
      },
      attachments: [
        {
          name: 'file.txt',
          content_type: 'text/plain',
          data: 'SGVsbG8=',
          content_id: 'file-id',
        },
      ],
    });
    expect(result).toEqual({provider: 'postal', messageId: 'postal-message-id'});
  });

  it('does not disable Postal tracking when tracking is enabled', async () => {
    const provider = new PostalProvider();

    await provider.sendEmail({
      from: {email: 'sender@example.com'},
      to: [{email: 'recipient@example.com'}],
      subject: 'Subject',
      html: '<p>Hello</p>',
      tracking: true,
    });

    expect(JSON.parse(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body as string)).toEqual(
      expect.objectContaining({
        headers: {},
      }),
    );
  });

  it('escapes display names for RFC5322 address formatting', () => {
    expect(formatPostalAddress({name: 'Sender "Quoted"', email: 'sender@example.com'})).toBe(
      '"Sender \\"Quoted\\"" <sender@example.com>',
    );
  });
});
