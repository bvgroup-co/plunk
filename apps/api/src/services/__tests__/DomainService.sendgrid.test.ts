import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DomainService} from '../DomainService.js';
import * as SESService from '../SESService.js';
import {NtfyService} from '../NtfyService.js';
import {factories} from '../../../../../test/helpers/index.js';

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.DIRECT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/plunk_test';
  process.env.EMAIL_PROVIDER = 'sendgrid';
  process.env.SENDGRID_API_KEY = 'sendgrid-key';
  const actual = await importOriginal<typeof import('../../app/constants.js')>();
  return {
    ...actual,
    EMAIL_PROVIDER: 'sendgrid',
    EMAIL_PROVIDER_IS_SENDGRID: true,
    EMAIL_PROVIDER_IS_SES: false,
    SENDGRID_API_KEY: 'sendgrid-key',
    SENDGRID_REGION: 'global',
    SENDGRID_DOMAIN_AUTH_SUBDOMAIN: 'mail',
    SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY: true,
    SENDGRID_DOMAIN_AUTH_DEFAULT: false,
    SENDGRID_ON_BEHALF_OF: '',
  };
});

describe('DomainService SendGrid domains', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(NtfyService, 'notifyDomainAdded').mockResolvedValue();
    vi.spyOn(SESService, 'verifyDomain').mockResolvedValue(['ses-token']);
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 123,
            domain: 'example.com',
            subdomain: 'mail',
            valid: false,
            dns: {
              mail_cname: {type: 'cname', host: 'mail.example.com', data: 'u123.wl.sendgrid.net'},
              dkim1: {type: 'cname', host: 's1._domainkey.example.com', data: 's1.domainkey.u123.wl.sendgrid.net'},
            },
          }),
          {status: 200},
        ),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('creates SendGrid domain authentication without touching AWS SES', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'SendGrid Project'});

    const domain = await DomainService.addDomain(project.id, 'example.com');

    expect(SESService.verifyDomain).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.sendgrid.com/v3/whitelabel/domains',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          domain: 'example.com',
          subdomain: 'mail',
          automatic_security: true,
          default: false,
        }),
      }),
    );
    expect(domain.provider).toBe('SENDGRID');
    expect(domain.providerDomainId).toBe('123');
    expect(domain.dkimTokens).toEqual([]);
    expect(domain.providerRecords).toEqual([
      {type: 'CNAME', host: 'mail.example.com', value: 'u123.wl.sendgrid.net'},
      {type: 'CNAME', host: 's1._domainkey.example.com', value: 's1.domainkey.u123.wl.sendgrid.net'},
    ]);
  });
});
