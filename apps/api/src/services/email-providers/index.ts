import {EMAIL_PROVIDER} from '../../app/constants.js';

import {SendGridProvider} from './SendGridProvider.js';
import {SESProvider} from './SESProvider.js';
import type {OutboundEmailProvider} from './types.js';

let provider: OutboundEmailProvider | null = null;

export function getOutboundEmailProvider(): OutboundEmailProvider {
  if (provider) {
    return provider;
  }

  switch (EMAIL_PROVIDER) {
    case 'sendgrid':
      provider = new SendGridProvider();
      break;
    case 'ses':
      provider = new SESProvider();
      break;
  }

  return provider;
}

export type {EmailAttachment, SendEmailInput, SendEmailResult} from './types.js';
