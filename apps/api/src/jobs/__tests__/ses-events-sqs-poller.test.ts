import {DeleteMessageCommand, ReceiveMessageCommand} from '@aws-sdk/client-sqs';
import {EmailStatus} from '@plunk/db';
import {describe, expect, it, vi} from 'vitest';

import {factories, getPrismaClient} from '../../../../../test/helpers';
import {SesEventsSqsPoller} from '../ses-events-sqs-poller';

function snsBody(messageId: string, sesMessageId: string) {
  return JSON.stringify({
    Type: 'Notification',
    MessageId: messageId,
    Message: JSON.stringify({eventType: 'Delivery', mail: {messageId: sesMessageId}}),
  });
}

describe('SesEventsSqsPoller', () => {
  const prisma = getPrismaClient();

  it('processes and deletes terminal SQS messages', async () => {
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail({
      projectId: project.id,
      contactId: contact.id,
      messageId: 'ses-sqs-message',
    });
    const sentCommands: unknown[] = [];
    const client = {
      send: vi.fn(async command => {
        sentCommands.push(command);
        if (command instanceof ReceiveMessageCommand) {
          return {
            Messages: [
              {
                MessageId: 'sqs-message-id',
                ReceiptHandle: 'receipt-handle',
                Body: snsBody('sns-sqs-message', 'ses-sqs-message'),
              },
            ],
          };
        }

        return {};
      }),
    };

    const poller = new SesEventsSqsPoller({client, queueUrl: 'https://sqs.test/queue', idleDelayMs: 0});
    await poller.pollOnce();

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);
    expect(sentCommands.some(command => command instanceof DeleteMessageCommand)).toBe(true);
  });

  it('deletes malformed messages as invalid terminal messages', async () => {
    const sentCommands: unknown[] = [];
    const client = {
      send: vi.fn(async command => {
        sentCommands.push(command);
        return {};
      }),
    };

    const poller = new SesEventsSqsPoller({client, queueUrl: 'https://sqs.test/queue'});
    await poller.processMessage({MessageId: 'bad-message', ReceiptHandle: 'receipt-handle', Body: '{'});

    expect(sentCommands.some(command => command instanceof DeleteMessageCommand)).toBe(true);
  });
});
