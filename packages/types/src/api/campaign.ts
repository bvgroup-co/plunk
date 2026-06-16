/**
 * Campaign service types
 */

import type {CampaignAudienceType, TemplateCssMode, TemplateMode, TemplateType} from '@plunk/db';
import type {FilterCondition} from '../segments/index.js';

/**
 * Data for creating a new campaign
 */
export interface CreateCampaignData {
  name: string;
  description?: string;
  subject: string;
  body: string;
  from: string;
  fromName?: string | null;
  replyTo?: string | null;
  type?: TemplateType;
  mode?: TemplateMode;
  cssMode?: TemplateCssMode;
  customCss?: string | null;
  audienceType: CampaignAudienceType;
  audienceCondition?: FilterCondition;
  segmentId?: string;
}

/**
 * Data for updating an existing campaign
 */
export interface UpdateCampaignData {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
  from?: string;
  fromName?: string | null;
  replyTo?: string | null;
  type?: TemplateType;
  mode?: TemplateMode;
  cssMode?: TemplateCssMode;
  customCss?: string | null;
  audienceType?: CampaignAudienceType;
  audienceCondition?: FilterCondition;
  segmentId?: string;
}
