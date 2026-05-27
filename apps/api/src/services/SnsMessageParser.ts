export type ParsedSnsEnvelope = {
  type: string;
  messageId: string;
  message: Record<string, unknown>;
};

export type ParsedSesSqsMessage = {
  dedupeKey: string;
  event: Record<string, unknown>;
};

function parseJsonObject(value: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Message body is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Message body must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function readRequiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }

  return value;
}

export class SnsMessageParser {
  public static parseSnsEnvelope(body: Record<string, unknown>): ParsedSnsEnvelope {
    const type = readRequiredString(body, 'Type');
    const messageId = readRequiredString(body, 'MessageId');
    const message = parseJsonObject(readRequiredString(body, 'Message'));

    return {type, messageId, message};
  }

  public static parseHttpSnsNotification(body: Record<string, unknown>): ParsedSesSqsMessage {
    const envelope = this.parseSnsEnvelope(body);
    if (envelope.type !== 'Notification') {
      throw new Error(`Unsupported SNS message type: ${envelope.type}`);
    }

    return {dedupeKey: envelope.messageId, event: envelope.message};
  }

  public static parseSqsMessage(body: string, sqsMessageId: string, rawMessageDelivery: boolean): ParsedSesSqsMessage {
    if (rawMessageDelivery) {
      return {dedupeKey: sqsMessageId, event: parseJsonObject(body)};
    }

    const envelope = this.parseSnsEnvelope(parseJsonObject(body));
    if (envelope.type !== 'Notification') {
      throw new Error(`Unsupported SNS message type: ${envelope.type}`);
    }

    return {dedupeKey: envelope.messageId, event: envelope.message};
  }
}
