import {describe, expect, it} from 'vitest';

import {SnsMessageParser} from '../SnsMessageParser';

const sesEvent = {eventType: 'Delivery', mail: {messageId: 'ses-message-id'}};

function snsEnvelope(messageId = 'sns-message-id') {
  return {
    Type: 'Notification',
    MessageId: messageId,
    Message: JSON.stringify(sesEvent),
  };
}

describe('SnsMessageParser', () => {
  it('parses SNS webhook notifications', () => {
    const parsed = SnsMessageParser.parseHttpSnsNotification(snsEnvelope());

    expect(parsed).toEqual({dedupeKey: 'sns-message-id', event: sesEvent});
  });

  it('parses SQS messages containing SNS envelopes', () => {
    const parsed = SnsMessageParser.parseSqsMessage(JSON.stringify(snsEnvelope('sns-from-sqs')), 'sqs-id', false);

    expect(parsed).toEqual({dedupeKey: 'sns-from-sqs', event: sesEvent});
  });

  it('uses SQS MessageId for raw message delivery', () => {
    const parsed = SnsMessageParser.parseSqsMessage(JSON.stringify(sesEvent), 'sqs-id', true);

    expect(parsed).toEqual({dedupeKey: 'sqs-id', event: sesEvent});
  });

  it('rejects malformed SNS envelopes', () => {
    expect(() => SnsMessageParser.parseSqsMessage('{', 'sqs-id', false)).toThrow(/valid JSON/);
    expect(() =>
      SnsMessageParser.parseSqsMessage(JSON.stringify({...snsEnvelope(), Message: '{'}), 'sqs-id', false),
    ).toThrow(/valid JSON/);
  });
});
