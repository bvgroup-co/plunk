import {EmailStatus} from '@plunk/db';
import {describe, expect, it} from 'vitest';

import {factories, getPrismaClient} from '../../../../../test/helpers';
import {SesEventProcessor} from '../SesEventProcessor';

describe('SesEventProcessor', () => {
  const prisma = getPrismaClient();

  it('processes delivery events and stores idempotency key', async () => {
    const {project} = await factories.createUserWithProject();
    const contact = await factories.createContact({projectId: project.id});
    const email = await factories.createEmail({
      projectId: project.id,
      contactId: contact.id,
      messageId: 'ses-delivery-message',
    });

    const result = await SesEventProcessor.process(
      {eventType: 'Delivery', mail: {messageId: 'ses-delivery-message'}},
      {dedupeKey: 'sns-delivery-message'},
    );

    expect(result.status).toBe('processed');
    await expect(
      SesEventProcessor.process({eventType: 'Delivery'}, {dedupeKey: 'sns-delivery-message'}),
    ).resolves.toEqual({
      status: 'duplicate',
      message: 'SES event already processed',
    });

    const updatedEmail = await prisma.email.findUniqueOrThrow({where: {id: email.id}});
    expect(updatedEmail.status).toBe(EmailStatus.DELIVERED);
    expect(updatedEmail.deliveredAt).toBeInstanceOf(Date);
    await expect(
      prisma.sesEventMessage.findUniqueOrThrow({where: {messageId: 'sns-delivery-message'}}),
    ).resolves.toBeTruthy();
  });

  it('returns invalid when outbound events are missing SES messageId', async () => {
    const result = await SesEventProcessor.process({eventType: 'Delivery'}, {dedupeKey: 'sns-invalid-message'});

    expect(result).toEqual({status: 'invalid', message: 'No messageId found'});
  });
});
