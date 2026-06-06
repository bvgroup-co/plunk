import {POSTAL_API_KEY, POSTAL_BASE_URL} from '../../app/constants.js';
import {HttpException} from '../../exceptions/index.js';

import {addListUnsubscribeHeader} from './unsubscribe.js';
import type {EmailAddress, EmailAttachment, OutboundEmailProvider, SendEmailInput, SendEmailResult} from './types.js';

interface PostalSendResponse {
  status?: string;
  message_id?: string | number;
  messages?: Record<string, {id?: string | number; token?: string}>;
  data?: {
    message_id?: string | number;
    messages?: Record<string, {id?: string | number; token?: string}>;
  };
}

interface PostalAttachment {
  name: string;
  content_type: string;
  data: string;
  content_id?: string;
}

function escapeAddressName(name: string): string {
  return name.replace(/[\\"]/g, match => `\\${match}`);
}

export function formatPostalAddress(address: EmailAddress): string {
  if (!address.name) {
    return address.email;
  }

  return `"${escapeAddressName(address.name)}" <${address.email}>`;
}

function formatAttachment(attachment: EmailAttachment): PostalAttachment {
  return {
    name: attachment.filename,
    content_type: attachment.contentType,
    data: attachment.content,
    ...(attachment.contentId ? {content_id: attachment.contentId} : {}),
  };
}

function getPostalBaseUrl(): string {
  return POSTAL_BASE_URL.replace(/\/$/, '');
}

function getPostalMessageId(response: PostalSendResponse, emailId: string | undefined): string {
  const messageId = response.message_id ?? response.data?.message_id;
  if (messageId) {
    return String(messageId);
  }

  const messages = response.messages ?? response.data?.messages;
  const firstMessage = messages ? Object.values(messages)[0] : undefined;
  const firstMessageId = firstMessage?.id ?? firstMessage?.token;
  if (firstMessageId) {
    return String(firstMessageId);
  }

  if (emailId) {
    return emailId;
  }

  throw new Error('Postal response did not include a message ID');
}

async function parsePostalJson(response: Response): Promise<PostalSendResponse> {
  if (response.status === 204) {
    return {};
  }

  return (await response.json()) as PostalSendResponse;
}

export class PostalProvider implements OutboundEmailProvider {
  public readonly provider = 'postal' as const;

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const headers = addListUnsubscribeHeader(input.headers, input.html) ?? {};
    if (input.emailId) {
      headers['X-Plunk-Email-ID'] = input.emailId;
    }
    if (input.projectId) {
      headers['X-Plunk-Project-ID'] = input.projectId;
    }
    if (input.tracking === false) {
      headers['X-AMP'] = 'skip';
    }

    const body = {
      to: input.to.map(formatPostalAddress),
      from: formatPostalAddress(input.from),
      subject: input.subject,
      html_body: input.html,
      headers,
      ...(input.reply ? {reply_to: input.reply} : {}),
      ...(input.attachments?.length ? {attachments: input.attachments.map(formatAttachment)} : {}),
    };

    const response = await fetch(`${getPostalBaseUrl()}/api/v1/send/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Server-API-Key': POSTAL_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new HttpException(response.status, errorBody || 'Postal request failed');
    }

    const result = await parsePostalJson(response);

    return {
      provider: this.provider,
      messageId: getPostalMessageId(result, input.emailId),
    };
  }
}
