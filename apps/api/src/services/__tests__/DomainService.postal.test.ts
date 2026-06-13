import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {factories} from '../../../../../test/helpers/index.js';
import {prisma} from '../../database/prisma.js';
import {NtfyService} from '../NtfyService.js';
import * as SESService from '../SESService.js';
import {DomainService} from '../DomainService.js';

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.API_URI = 'http://localhost:8080';
  process.env.DASHBOARD_URI = 'http://localhost:3000';
  process.env.JWT_SECRET = 'test';
  process.env.EMAIL_PROVIDER = 'postal';
  process.env.POSTAL_BASE_URL = 'https://postal.example.com';
  process.env.POSTAL_API_KEY = 'postal-key';
  process.env.POSTAL_DOMAIN_API_BASE_URL = 'https://postal-domains.example.com/';
  process.env.POSTAL_DOMAIN_API_KEY = 'postal-domain-key';
  process.env.POSTAL_DOMAIN_SERVER_ID = 'server-123';
  const actual = await importOriginal<typeof import('../../app/constants.js')>();
  return {
    ...actual,
    EMAIL_PROVIDER: 'postal',
    EMAIL_PROVIDER_IS_POSTAL: true,
    EMAIL_PROVIDER_IS_SENDGRID: false,
    EMAIL_PROVIDER_IS_SES: false,
    POSTAL_API_KEY: 'postal-key',
    POSTAL_DOMAIN_API_BASE_URL: 'https://postal-domains.example.com/',
    POSTAL_DOMAIN_API_KEY: 'postal-domain-key',
    POSTAL_DOMAIN_SERVER_ID: 'server-123',
    POSTAL_DOMAIN_SERVER_PERMALINK: '',
  };
});

const postalRecords = [
  {
    type: 'TXT',
    host: 'example.com',
    value: 'postal-verification-token',
    purpose: 'ownership-verification',
    required: true,
    status: 'Pending',
  },
  {
    type: 'CNAME',
    host: 'psrp.example.com',
    value: 'return.postal.example.com',
    purpose: 'return-path',
    required: true,
    status: 'Pending',
  },
  {
    type: 'MX',
    host: 'example.com',
    value: 'mx.postal.example.com',
    priority: 10,
    purpose: 'inbound-mx',
    required: false,
    status: 'Pending',
  },
] as const;

const storedPostalRecords = postalRecords.map(record => ({...record}));

function postalResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'postal-domain-123',
    uuid: 'postal-domain-uuid',
    name: 'example.com',
    verified: false,
    records: postalRecords,
    statuses: {spf: 'Pending'},
    ...overrides,
  };
}

describe('DomainService Postal domains', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(NtfyService, 'notifyDomainAdded').mockResolvedValue();
    vi.spyOn(SESService, 'verifyDomain').mockResolvedValue(['ses-token']);
    global.fetch = vi.fn(async () => new Response(JSON.stringify(postalResponse()), {status: 200}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('creates Postal domains through the domain-management integration', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});

    const domain = await DomainService.addDomain(project.id, 'example.com');

    expect(SESService.verifyDomain).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://postal-domains.example.com/api/v1/domains',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({domain: 'example.com', server_id: 'server-123'}),
      }),
    );
    expect(domain.provider).toBe('POSTAL');
    expect(domain.providerDomainId).toBe('postal-domain-123');
    expect(domain.dkimTokens).toEqual([]);
    expect(domain.providerRecords).toEqual(storedPostalRecords);
    expect(domain.providerRecords).not.toContainEqual({
      type: 'CNAME',
      host: 'mail.example.com',
      value: expect.any(String),
    });
    expect(domain.providerData).toMatchObject({
      id: 'postal-domain-123',
      uuid: 'postal-domain-uuid',
      name: 'example.com',
      verified: false,
      records: storedPostalRecords,
      statuses: {spf: 'Pending'},
    });
  });

  it('does not create a local domain when Postal domain creation fails', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});
    global.fetch = vi.fn(async () => new Response('Postal unavailable', {status: 503}));

    await expect(DomainService.addDomain(project.id, 'example.com')).rejects.toThrow('Postal unavailable');

    await expect(prisma.domain.count({where: {projectId: project.id}})).resolves.toBe(0);
  });

  it('refreshes Postal verification status and records from Postal', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});
    const domain = await DomainService.addDomain(project.id, 'example.com');
    const refreshedRecords = postalRecords.map(record => ({...record, status: 'OK'}));
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(postalResponse({verified: true, records: refreshedRecords, statuses: {spf: 'OK'}})), {
        status: 200,
      }),
    );

    const status = await DomainService.checkVerification(domain.id);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://postal-domains.example.com/api/v1/domains/postal-domain-123/check',
      expect.objectContaining({method: 'POST'}),
    );
    expect(status).toEqual({
      domain: 'example.com',
      tokens: [],
      records: refreshedRecords,
      status: 'Success',
      verified: true,
      provider: 'postal',
    });
    await expect(prisma.domain.findUniqueOrThrow({where: {id: domain.id}})).resolves.toMatchObject({
      verified: true,
      providerRecords: refreshedRecords,
      providerError: null,
    });
  });

  it('deletes Postal domains through the domain-management integration', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});
    const domain = await DomainService.addDomain(project.id, 'example.com');
    global.fetch = vi.fn(async () => new Response('', {status: 200}));

    await DomainService.removeDomain(domain.id);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://postal-domains.example.com/api/v1/domains/postal-domain-123',
      expect.objectContaining({method: 'DELETE'}),
    );
  });
});
