import type {EmailProvider} from '../../app/constants.js';

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  contentId?: string;
  disposition?: 'attachment' | 'inline';
}

export interface SendEmailInput {
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  html: string;
  reply?: string;
  headers?: Record<string, string> | null;
  attachments?: EmailAttachment[] | null;
  tracking?: boolean;
  emailId?: string;
  projectId?: string;
}

export interface SendEmailResult {
  provider: EmailProvider;
  messageId: string;
}

export interface EmailRateLimit {
  maxSendRate: number;
  max24HourSend?: number;
  sentLast24Hours?: number;
}

export interface OutboundEmailProvider {
  readonly provider: EmailProvider;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  getRateLimit?(): Promise<EmailRateLimit | null>;
}
