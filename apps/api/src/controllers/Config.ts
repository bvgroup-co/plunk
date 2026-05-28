import {Controller, Get} from '@overnightjs/core';
import type {Request, Response} from 'express';

import {
  API_URI,
  AUTH_MODE,
  AWS_SES_REGION,
  DASHBOARD_URI,
  DISABLE_SIGNUPS,
  GITHUB_OAUTH_ENABLED,
  GOOGLE_OAUTH_ENABLED,
  LANDING_URI,
  MAIL_FROM_SUBDOMAIN,
  NODE_ENV,
  OAUTH_AUTH_ENABLED,
  OIDC_DISPLAY_NAME,
  OIDC_ENABLED,
  PASSWORD_AUTH_ENABLED,
  S3_ENABLED,
  SMTP_DOMAIN,
  SMTP_ENABLED,
  SMTP_PORT_SECURE,
  SMTP_PORT_SUBMISSION,
  STRIPE_ENABLED,
  TRACKING_TOGGLE_ENABLED,
  WIKI_URI,
} from '../app/constants.js';

@Controller('config')
export class Config {
  /**
   * GET /config
   * Expose a unified view of instance capabilities and feature flags for frontends.
   */
  @Get('')
  public getConfig(req: Request, res: Response) {
    return res.status(200).json({
      environment: NODE_ENV,
      urls: {
        api: API_URI,
        dashboard: DASHBOARD_URI,
        landing: LANDING_URI,
        wiki: WIKI_URI || null,
      },
      features: {
        billing: {
          enabled: STRIPE_ENABLED,
        },
        storage: {
          s3Enabled: S3_ENABLED,
        },
        auth: {
          mode: AUTH_MODE,
          password: {
            enabled: PASSWORD_AUTH_ENABLED,
            signupEnabled: PASSWORD_AUTH_ENABLED && !DISABLE_SIGNUPS,
          },
          oidc: {
            enabled: OIDC_ENABLED,
            displayName: OIDC_DISPLAY_NAME,
          },
          oauth: {
            enabled: OAUTH_AUTH_ENABLED,
            google: GOOGLE_OAUTH_ENABLED,
            github: GITHUB_OAUTH_ENABLED,
          },
        },
        authProviders: {
          github: GITHUB_OAUTH_ENABLED,
          google: GOOGLE_OAUTH_ENABLED,
          oidc: OIDC_ENABLED,
          oidcDisplayName: OIDC_DISPLAY_NAME,
        },
        email: {
          trackingToggleEnabled: TRACKING_TOGGLE_ENABLED,
        },
        smtp: {
          enabled: SMTP_ENABLED,
          domain: SMTP_ENABLED ? SMTP_DOMAIN : null,
          ports: SMTP_ENABLED
            ? {
                secure: SMTP_PORT_SECURE,
                submission: SMTP_PORT_SUBMISSION,
              }
            : null,
        },
      },
      aws: {
        sesRegion: AWS_SES_REGION,
        mailFromSubdomain: MAIL_FROM_SUBDOMAIN,
      },
    });
  }
}
