import {describe, expect, it} from 'vitest';
import {CampaignAudienceType, TemplateCssMode, TemplateMode, TemplateType} from '@plunk/db';
import {applyCopiedRenderingSettings, buildCreateCampaignPayload, buildTemplateCampaignQuery} from '../campaignRendering';

describe('campaign rendering UI helpers', () => {
  const template = {
    id: 'template-id',
    name: 'Template',
    subject: 'Template subject',
    body: '<p>Template body</p>',
    from: 'sender@example.com',
    fromName: 'Sender',
    replyTo: 'reply@example.com',
    mode: TemplateMode.PLAIN_TEXT,
    cssMode: TemplateCssMode.CUSTOM,
    customCss: '.custom { color: red; }',
  };

  it('copies rendering settings when template body is selected', () => {
    const rendering = applyCopiedRenderingSettings(
      {mode: TemplateMode.HTML, cssMode: TemplateCssMode.GLOBAL, customCss: ''},
      template,
      true,
    );

    expect(rendering).toEqual({
      mode: TemplateMode.PLAIN_TEXT,
      cssMode: TemplateCssMode.CUSTOM,
      customCss: '.custom { color: red; }',
    });
  });

  it('does not copy rendering settings when template body is not selected', () => {
    const current = {mode: TemplateMode.HTML, cssMode: TemplateCssMode.GLOBAL, customCss: ''};

    expect(applyCopiedRenderingSettings(current, template, false)).toBe(current);
    expect(buildTemplateCampaignQuery(template as never, {
      subject: true,
      body: false,
      from: true,
      fromName: true,
      replyTo: true,
    })).not.toHaveProperty('templateId');
  });

  it('includes rendering fields in create campaign payload', () => {
    const payload = buildCreateCampaignPayload({
      name: 'Campaign',
      description: '',
      subject: 'Subject',
      body: '<p>Body</p>',
      from: 'sender@example.com',
      fromName: '',
      replyTo: '',
      type: TemplateType.MARKETING,
      mode: TemplateMode.PLAIN_TEXT,
      cssMode: TemplateCssMode.CUSTOM,
      customCss: '.custom { color: blue; }',
      audienceType: CampaignAudienceType.ALL,
      segmentId: '',
    });

    expect(payload.mode).toBe(TemplateMode.PLAIN_TEXT);
    expect(payload.cssMode).toBe(TemplateCssMode.CUSTOM);
    expect(payload.customCss).toBe('.custom { color: blue; }');
  });
});
