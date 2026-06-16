import {describe, expect, it} from 'vitest';
import {CampaignAudienceType} from '@plunk/db';
import {CampaignSchemas} from '../index.js';

describe('campaign rendering schemas', () => {
  const createPayload = {
    name: 'Campaign',
    subject: 'Subject',
    body: 'Body',
    from: 'sender@example.com',
    audienceType: CampaignAudienceType.ALL,
  };

  it('defaults missing campaign mode and CSS mode', () => {
    const parsed = CampaignSchemas.create.parse(createPayload);

    expect(parsed.mode).toBe('HTML');
    expect(parsed.cssMode).toBe('GLOBAL');
    expect(parsed.customCss).toBeUndefined();
  });

  it('accepts campaign rendering fields on create and update', () => {
    const createParsed = CampaignSchemas.create.parse({
      ...createPayload,
      mode: 'PLAIN_TEXT',
      cssMode: 'CUSTOM',
      customCss: '.prose { color: red; }',
    });
    const updateParsed = CampaignSchemas.update.parse({
      mode: 'HTML',
      cssMode: 'CUSTOM',
      customCss: '.prose { color: blue; }',
    });

    expect(createParsed.mode).toBe('PLAIN_TEXT');
    expect(createParsed.cssMode).toBe('CUSTOM');
    expect(createParsed.customCss).toBe('.prose { color: red; }');
    expect(updateParsed).toEqual({
      mode: 'HTML',
      cssMode: 'CUSTOM',
      customCss: '.prose { color: blue; }',
    });
  });

  it('rejects invalid campaign mode and CSS mode', () => {
    expect(CampaignSchemas.create.safeParse({...createPayload, mode: 'TEXT'}).success).toBe(false);
    expect(CampaignSchemas.update.safeParse({cssMode: 'LOCAL'}).success).toBe(false);
  });
});
