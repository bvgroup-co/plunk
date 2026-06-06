import dns from 'node:dns/promises';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {factories} from '../../../../../test/helpers/index.js';
import {NtfyService} from '../NtfyService.js';
import * as SESService from '../SESService.js';
import {DomainService} from '../DomainService.js';

vi.mock('node:dns/promises', () => ({
  default: {
    resolveCname: vi.fn(),
  },
}));

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.EMAIL_PROVIDER = 'postal';
  process.env.POSTAL_BASE_URL = 'https://postal.example.com';
  process.env.POSTAL_API_KEY = 'postal-key';
  process.env.POSTAL_CNAME_VALUE = 'postal-cname.example.com';
  const actual = await importOriginal<typeof import('../../app/constants.js')>();
  return {
    ...actual,
    EMAIL_PROVIDER: 'postal',
    EMAIL_PROVIDER_IS_POSTAL: true,
    EMAIL_PROVIDER_IS_SENDGRID: false,
    EMAIL_PROVIDER_IS_SES: false,
    POSTAL_CNAME_VALUE: 'postal-cname.example.com',
    POSTAL_DNS_CHECK_ENABLED: false,
    POSTAL_DOMAIN_AUTH_SUBDOMAIN: 'mail',
  };
});

describe('DomainService Postal domains', () => {
  beforeEach(() => {
    vi.spyOn(NtfyService, 'notifyDomainAdded').mockResolvedValue();
    vi.spyOn(SESService, 'verifyDomain').mockResolvedValue(['ses-token']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates Postal DNS records without touching AWS SES', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});

    const domain = await DomainService.addDomain(project.id, 'example.com');

    expect(SESService.verifyDomain).not.toHaveBeenCalled();
    expect(domain.provider).toBe('POSTAL');
    expect(domain.dkimTokens).toEqual([]);
    expect(domain.providerRecords).toEqual([
      {type: 'CNAME', host: 'mail.example.com', value: 'postal-cname.example.com'},
    ]);
  });

  it('leaves Postal domains pending when DNS checks are disabled', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});
    const domain = await DomainService.addDomain(project.id, 'example.com');

    const status = await DomainService.checkVerification(domain.id);

    expect(dns.resolveCname).not.toHaveBeenCalled();
    expect(status).toEqual({
      domain: 'example.com',
      tokens: [],
      records: [{type: 'CNAME', host: 'mail.example.com', value: 'postal-cname.example.com'}],
      status: 'Pending',
      verified: false,
      provider: 'postal',
    });
  });
});
