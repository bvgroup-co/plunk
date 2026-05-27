import {DeleteMessageCommand, ReceiveMessageCommand, SQSClient} from '@aws-sdk/client-sqs';
import type {Message} from '@aws-sdk/client-sqs';
import signale from 'signale';

import {
  SES_EVENTS_SQS_ACCESS_KEY_ID,
  SES_EVENTS_SQS_IDLE_DELAY_MS,
  SES_EVENTS_SQS_MAX_MESSAGES,
  SES_EVENTS_SQS_QUEUE_URL,
  SES_EVENTS_SQS_RAW_MESSAGE_DELIVERY,
  SES_EVENTS_SQS_REGION,
  SES_EVENTS_SQS_SECRET_ACCESS_KEY,
  SES_EVENTS_SQS_VISIBILITY_TIMEOUT_SECONDS,
  SES_EVENTS_SQS_WAIT_TIME_SECONDS,
} from '../app/constants.js';
import {SesEventProcessor} from '../services/SesEventProcessor.js';
import type {SesEventProcessingStatus} from '../services/SesEventProcessor.js';
import {SnsMessageParser} from '../services/SnsMessageParser.js';

const TERMINAL_STATUSES = new Set<SesEventProcessingStatus>(['processed', 'duplicate', 'ignored', 'invalid']);

type SqsClient = Pick<SQSClient, 'send'>;

type SesEventsSqsPollerOptions = {
  client?: SqsClient;
  queueUrl?: string;
  rawMessageDelivery?: boolean;
  waitTimeSeconds?: number;
  maxMessages?: number;
  visibilityTimeoutSeconds?: number;
  idleDelayMs?: number;
};

export class SesEventsSqsPoller {
  private stopped = false;

  private readonly client: SqsClient;
  private readonly queueUrl: string;
  private readonly rawMessageDelivery: boolean;
  private readonly waitTimeSeconds: number;
  private readonly maxMessages: number;
  private readonly visibilityTimeoutSeconds: number;
  private readonly idleDelayMs: number;

  public constructor(options: SesEventsSqsPollerOptions = {}) {
    const queueUrl = options.queueUrl ?? SES_EVENTS_SQS_QUEUE_URL;
    if (!queueUrl) {
      throw new Error('SES_EVENTS_SQS_QUEUE_URL is required when SES_EVENTS_SQS_ENABLED is true');
    }

    this.queueUrl = queueUrl;
    this.rawMessageDelivery = options.rawMessageDelivery ?? SES_EVENTS_SQS_RAW_MESSAGE_DELIVERY;
    this.waitTimeSeconds = options.waitTimeSeconds ?? SES_EVENTS_SQS_WAIT_TIME_SECONDS;
    this.maxMessages = options.maxMessages ?? SES_EVENTS_SQS_MAX_MESSAGES;
    this.visibilityTimeoutSeconds = options.visibilityTimeoutSeconds ?? SES_EVENTS_SQS_VISIBILITY_TIMEOUT_SECONDS;
    this.idleDelayMs = options.idleDelayMs ?? SES_EVENTS_SQS_IDLE_DELAY_MS;
    this.client = options.client ?? this.createClient();
  }

  public async start(): Promise<void> {
    signale.info('[SES_EVENTS_SQS] Poller started');

    while (!this.stopped) {
      await this.pollOnce();
    }

    signale.info('[SES_EVENTS_SQS] Poller stopped');
  }

  public stop(): void {
    this.stopped = true;
  }

  public async pollOnce(): Promise<void> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: this.waitTimeSeconds,
        VisibilityTimeout: this.visibilityTimeoutSeconds,
      }),
    );

    const messages = response.Messages ?? [];
    if (messages.length === 0) {
      await this.sleep(this.idleDelayMs);
      return;
    }

    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  public async processMessage(message: Message): Promise<void> {
    const {Body: body, MessageId: messageId, ReceiptHandle: receiptHandle} = message;
    if (!messageId || !receiptHandle || !body) {
      signale.warn('[SES_EVENTS_SQS] Invalid SQS message envelope');
      if (receiptHandle) {
        await this.deleteMessage(receiptHandle);
      }
      return;
    }

    let parsed;
    try {
      parsed = SnsMessageParser.parseSqsMessage(body, messageId, this.rawMessageDelivery);
    } catch (error) {
      signale.warn(
        `[SES_EVENTS_SQS] Invalid SES event message ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.deleteMessage(receiptHandle);
      return;
    }

    try {
      const result = await SesEventProcessor.process(parsed.event, {dedupeKey: parsed.dedupeKey});

      if (TERMINAL_STATUSES.has(result.status)) {
        await this.deleteMessage(receiptHandle);
      }
    } catch (error) {
      signale.error(
        `[SES_EVENTS_SQS] Failed to process SES event message ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle}));
  }

  private createClient(): SQSClient {
    return new SQSClient({
      region: SES_EVENTS_SQS_REGION,
      credentials: {
        accessKeyId: SES_EVENTS_SQS_ACCESS_KEY_ID,
        secretAccessKey: SES_EVENTS_SQS_SECRET_ACCESS_KEY,
      },
    });
  }

  private async sleep(milliseconds: number): Promise<void> {
    if (milliseconds === 0) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, milliseconds));
  }
}

export function createSesEventsSqsPoller(): SesEventsSqsPoller {
  return new SesEventsSqsPoller();
}
