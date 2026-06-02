import sendgrid from '@sendgrid/mail';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {SendGridProvider} from '../SendGridProvider.js';

vi.mock('@sendgrid/mail', () => ({
  default: {
    send: vi.fn(),
    setApiKey: vi.fn(),
  },
}));

vi.mock('../../../app/constants.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../app/constants.js')>();
  return {
    ...actual,
    SENDGRID_API_KEY: 'sendgrid-api-key',
    SENDGRID_SANDBOX_MODE: true,
  };
});

describe('SendGridProvider', () => {
  beforeEach(() => {
    vi.mocked(sendgrid.send).mockResolvedValue([{headers: {'x-message-id': 'sendgrid-message-id'}} as never, {}]);
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

    expect(sendgrid.setApiKey).toHaveBeenCalledWith('sendgrid-api-key');
    expect(sendgrid.send).toHaveBeenCalledWith(
      expect.objectContaining({
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
            contentId: undefined,
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
      }),
    );
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

    expect(sendgrid.send).toHaveBeenCalledWith(
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
