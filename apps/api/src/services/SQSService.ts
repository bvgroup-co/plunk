import {DeleteMessageCommand, ReceiveMessageCommand, SQSClient} from '@aws-sdk/client-sqs';

import {
  AWS_SES_ACCESS_KEY_ID,
  AWS_SES_REGION,
  AWS_SES_SECRET_ACCESS_KEY,
  SES_EVENTS_SQS_MAX_MESSAGES,
  SES_EVENTS_SQS_QUEUE_URL,
  SES_EVENTS_SQS_VISIBILITY_TIMEOUT_SECONDS,
  SES_EVENTS_SQS_WAIT_TIME_SECONDS,
} from '../app/constants.js';

export const sqsClient = new SQSClient({
  region: AWS_SES_REGION,
  credentials: {
    accessKeyId: AWS_SES_ACCESS_KEY_ID,
    secretAccessKey: AWS_SES_SECRET_ACCESS_KEY,
  },
});

export async function receiveSesEventMessages() {
  return sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: SES_EVENTS_SQS_QUEUE_URL,
      MaxNumberOfMessages: SES_EVENTS_SQS_MAX_MESSAGES,
      WaitTimeSeconds: SES_EVENTS_SQS_WAIT_TIME_SECONDS,
      VisibilityTimeout: SES_EVENTS_SQS_VISIBILITY_TIMEOUT_SECONDS,
    }),
  );
}

export async function deleteSesEventMessage(receiptHandle: string) {
  return sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: SES_EVENTS_SQS_QUEUE_URL,
      ReceiptHandle: receiptHandle,
    }),
  );
}
