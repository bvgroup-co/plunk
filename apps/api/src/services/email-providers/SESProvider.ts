import {getSendingQuota, sendRawEmail} from '../SESService.js';

import type {EmailRateLimit, OutboundEmailProvider, SendEmailInput, SendEmailResult} from './types.js';

export class SESProvider implements OutboundEmailProvider {
  public readonly provider = 'ses' as const;

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await sendRawEmail({
      from: input.from,
      to: input.to,
      content: {
        subject: input.subject,
        html: input.html,
      },
      reply: input.reply,
      headers: input.headers,
      attachments: input.attachments,
      tracking: input.tracking,
    });

    return {
      provider: this.provider,
      messageId: result.messageId,
    };
  }

  public async getRateLimit(): Promise<EmailRateLimit | null> {
    return getSendingQuota();
  }
}
