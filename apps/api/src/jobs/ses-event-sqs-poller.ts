import signale from 'signale';

import {SES_EVENTS_SQS_ENABLED} from '../app/constants.js';
import {deleteSesEventMessage, receiveSesEventMessages} from '../services/SQSService.js';
import {SesNotificationService} from '../services/SesNotificationService.js';

interface SnsEnvelope {
  Type?: string;
  MessageId?: string;
  Message?: string;
}

export class SesEventSqsPoller {
  private stopped = true;
  private pollPromise: Promise<void> | null = null;

  public start(): void {
    if (!SES_EVENTS_SQS_ENABLED) {
      return;
    }

    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.pollPromise = this.pollLoop();
    signale.success('[SES-SQS] SES event SQS poller started');
  }

  public async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    await this.pollPromise;
    signale.info('[SES-SQS] SES event SQS poller stopped');
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const response = await receiveSesEventMessages();
        const messages = response.Messages || [];

        for (const message of messages) {
          if (this.stopped) {
            break;
          }

          if (!message.Body || !message.ReceiptHandle) {
            signale.warn('[SES-SQS] Received SQS message without body or receipt handle');
            continue;
          }

          try {
            const snsEnvelope = JSON.parse(message.Body) as SnsEnvelope;

            if (snsEnvelope.Type !== 'Notification') {
              signale.warn('[SES-SQS] Skipping non-notification SNS envelope:', snsEnvelope.Type);
              await deleteSesEventMessage(message.ReceiptHandle);
              continue;
            }

            const result = await SesNotificationService.processSnsNotification(snsEnvelope);

            if (!result.success) {
              throw new Error(result.message);
            }

            await deleteSesEventMessage(message.ReceiptHandle);
            signale.success(`[SES-SQS] Processed and deleted SNS message ${snsEnvelope.MessageId}`);
          } catch (error) {
            signale.error('[SES-SQS] Failed to process SQS message; leaving it for redelivery:', error);
          }
        }
      } catch (error) {
        signale.error('[SES-SQS] SQS receive failed:', error);
      }
    }
  }
}

export function createSesEventSqsPoller(): SesEventSqsPoller | null {
  if (!SES_EVENTS_SQS_ENABLED) {
    return null;
  }

  return new SesEventSqsPoller();
}
