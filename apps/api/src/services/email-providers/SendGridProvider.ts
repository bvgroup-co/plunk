import type {MailDataRequired} from '@sendgrid/mail';
import {SENDGRID_SANDBOX_MODE} from '../../app/constants.js';

import {sendGridRequest} from '../../utils/sendgrid.js';

import {addListUnsubscribeHeader} from './unsubscribe.js';
import type {EmailAddress, OutboundEmailProvider, SendEmailInput, SendEmailResult} from './types.js';

function formatAddress(address: EmailAddress) {
  return address.name ? {email: address.email, name: address.name} : {email: address.email};
}

function getHeader(headers: Headers, name: string): string {
  const headerValue = headers.get(name);

  if (!headerValue) {
    throw new Error(`SendGrid response did not include ${name}`);
  }

  return headerValue;
}

export class SendGridProvider implements OutboundEmailProvider {
  public readonly provider = 'sendgrid' as const;

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const headers = addListUnsubscribeHeader(input.headers, input.html);
    const message: MailDataRequired = {
      from: formatAddress(input.from),
      to: input.to.map(formatAddress),
      subject: input.subject,
      html: input.html,
      headers: headers ?? undefined,
      attachments: input.attachments?.map(attachment => ({
        content: attachment.content,
        filename: attachment.filename,
        type: attachment.contentType,
        disposition: attachment.disposition ?? 'attachment',
        contentId: attachment.contentId,
      })),
      customArgs: {
        ...(input.emailId ? {plunk_email_id: input.emailId} : {}),
        ...(input.projectId ? {plunk_project_id: input.projectId} : {}),
      },
      mailSettings: {
        sandboxMode: {
          enable: SENDGRID_SANDBOX_MODE,
        },
      },
      trackingSettings: {
        clickTracking: {
          enable: input.tracking ?? true,
          enableText: input.tracking ?? true,
        },
        openTracking: {
          enable: input.tracking ?? true,
        },
      },
    };

    if (input.reply) {
      message.replyTo = {email: input.reply};
    }

    const response = await sendGridRequest('/v3/mail/send', {
      method: 'POST',
      body: JSON.stringify(message),
    });
    const messageId = getHeader(response.headers, 'x-message-id');

    return {
      provider: this.provider,
      messageId,
    };
  }
}
