import type {Campaign, Template} from '@plunk/db';
import {CampaignAudienceType, TemplateCssMode, TemplateMode, TemplateType} from '@plunk/db';

export interface TemplateCopyFields {
  subject: boolean;
  body: boolean;
  from: boolean;
  fromName: boolean;
  replyTo: boolean;
}

export interface CampaignCopyFields extends TemplateCopyFields {
  audience: boolean;
}

export interface CampaignRenderingState {
  mode: TemplateMode;
  cssMode: TemplateCssMode;
  customCss: string;
}

export interface CreateCampaignPayload {
  name: string;
  description?: string;
  subject: string;
  body: string;
  from: string;
  fromName: string | null;
  replyTo: string | null;
  type: TemplateType;
  mode: TemplateMode;
  cssMode: TemplateCssMode;
  customCss: string | null;
  audienceType: CampaignAudienceType;
  segmentId?: string;
  audienceFilter?: never[];
}

export function applyCopiedRenderingSettings(
  current: CampaignRenderingState,
  source: Pick<Template | Campaign, 'mode' | 'cssMode' | 'customCss'>,
  copyBody: boolean,
): CampaignRenderingState {
  if (!copyBody) {
    return current;
  }

  return {
    mode: source.mode,
    cssMode: source.cssMode,
    customCss: source.customCss ?? '',
  };
}

export function buildTemplateCampaignQuery(template: Template, selectedFields: TemplateCopyFields): Record<string, string> {
  const query: Record<string, string> = {
    name: template.name,
  };

  if (selectedFields.body) {
    query.templateId = template.id;
  }

  if (selectedFields.subject) {
    query.subject = template.subject;
  }

  if (selectedFields.from) {
    query.from = template.from;
  }

  if (selectedFields.fromName && template.fromName) {
    query.fromName = template.fromName;
  }

  if (selectedFields.replyTo && template.replyTo) {
    query.replyTo = template.replyTo;
  }

  return query;
}

export function buildCreateCampaignPayload({
  name,
  description,
  subject,
  body,
  from,
  fromName,
  replyTo,
  type,
  mode,
  cssMode,
  customCss,
  audienceType,
  segmentId,
}: {
  name: string;
  description: string;
  subject: string;
  body: string;
  from: string;
  fromName: string;
  replyTo: string;
  type: TemplateType;
  mode: TemplateMode;
  cssMode: TemplateCssMode;
  customCss: string;
  audienceType: CampaignAudienceType;
  segmentId: string;
}): CreateCampaignPayload {
  return {
    name,
    description: description || undefined,
    subject,
    body,
    from,
    fromName: fromName || null,
    replyTo: replyTo || null,
    type,
    mode,
    cssMode,
    customCss: customCss || null,
    audienceType,
    segmentId: audienceType === CampaignAudienceType.SEGMENT ? segmentId : undefined,
    audienceFilter: audienceType === CampaignAudienceType.FILTERED ? [] : undefined,
  };
}

export {TemplateCssMode, TemplateMode};
