import {describe, expect, it} from 'vitest';
import {ProjectSchemas, TemplateSchemas} from '../index.js';

describe('template rendering schemas', () => {
  it('defaults missing template mode and CSS mode', () => {
    const parsed = TemplateSchemas.create.parse({
      name: 'Template',
      subject: 'Subject',
      body: 'Body',
      from: 'sender@example.com',
    });

    expect(parsed.mode).toBe('HTML');
    expect(parsed.cssMode).toBe('GLOBAL');
  });

  it('accepts template mode and CSS override fields', () => {
    const parsed = TemplateSchemas.update.parse({
      mode: 'PLAIN_TEXT',
      cssMode: 'CUSTOM',
      customCss: '.prose { color: red; }',
    });

    expect(parsed).toEqual({
      mode: 'PLAIN_TEXT',
      cssMode: 'CUSTOM',
      customCss: '.prose { color: red; }',
    });
  });

  it('rejects invalid template mode and CSS mode', () => {
    expect(TemplateSchemas.create.safeParse({
      name: 'Template',
      subject: 'Subject',
      body: 'Body',
      from: 'sender@example.com',
      mode: 'TEXT',
    }).success).toBe(false);
    expect(TemplateSchemas.update.safeParse({cssMode: 'LOCAL'}).success).toBe(false);
  });

  it('accepts project global email CSS updates', () => {
    const parsed = ProjectSchemas.update.parse({globalEmailCss: '.prose { color: blue; }'});

    expect(parsed.globalEmailCss).toBe('.prose { color: blue; }');
  });
});
