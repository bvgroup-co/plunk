import {EmailProvider} from '@plunk/db';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {factories} from '../../../../../test/helpers/index.js';
import {prisma} from '../../database/prisma.js';
import {NtfyService} from '../NtfyService.js';
import * as SESService from '../SESService.js';
import {DomainService} from '../DomainService.js';

vi.mock('../../app/constants.js', async importOriginal => {
  process.env.EMAIL_PROVIDER = 'postal';
  process.env.POSTAL_BASE_URL = 'https://postal.example.com';
  process.env.POSTAL_API_KEY = 'postal-key';
  const actual = await importOriginal<typeof import('../../app/constants.js')>();
  return {
    ...actual,
    EMAIL_PROVIDER: 'postal',
    EMAIL_PROVIDER_IS_POSTAL: true,
    EMAIL_PROVIDER_IS_SENDGRID: false,
    EMAIL_PROVIDER_IS_SES: false,
  };
});

const postalDomainError =
  'Automatic Postal domain management is not supported with stock Postal. Create and verify the domain in Postal first, then use the DNS records shown in Postal, or configure a real supported Postal admin/companion integration before adding Postal domains in Plunk.';

describe('DomainService Postal domains', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(NtfyService, 'notifyDomainAdded').mockResolvedValue();
    vi.spyOn(NtfyService, 'notifyDomainRemoved').mockResolvedValue();
    vi.spyOn(SESService, 'verifyDomain').mockResolvedValue(['ses-token']);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({message_id: 'postal-message-id'}), {status: 200}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fails loudly instead of creating domains through stock Postal APIs', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});

    await expect(DomainService.addDomain(project.id, 'example.com')).rejects.toThrow(postalDomainError);

    expect(SESService.verifyDomain).not.toHaveBeenCalled();
    expect(NtfyService.notifyDomainAdded).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    await expect(prisma.domain.count({where: {projectId: project.id}})).resolves.toBe(0);
  });

  it('fails verification checks for Postal domains without calling stock Postal APIs', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});
    const domain = await prisma.domain.create({
      data: {
        projectId: project.id,
        domain: 'example.com',
        provider: EmailProvider.POSTAL,
        verified: false,
        dkimTokens: [],
      },
    });

    await expect(DomainService.checkVerification(domain.id)).rejects.toThrow(postalDomainError);

    expect(global.fetch).not.toHaveBeenCalled();
    await expect(prisma.domain.findUniqueOrThrow({where: {id: domain.id}})).resolves.toMatchObject({
      provider: EmailProvider.POSTAL,
      providerRecords: null,
      providerError: postalDomainError,
      verified: false,
    });
  });

  it('removes only the local Postal domain record without provider cleanup calls', async () => {
    const {project} = await factories.createUserWithProject({}, {name: 'Postal Project'});
    const domain = await prisma.domain.create({
      data: {
        projectId: project.id,
        domain: 'example.com',
        provider: EmailProvider.POSTAL,
        verified: false,
        dkimTokens: [],
        providerDomainId: 'manual-postal-domain-id',
      },
    });

    await DomainService.removeDomain(domain.id);

    expect(global.fetch).not.toHaveBeenCalled();
    await expect(prisma.domain.findUnique({where: {id: domain.id}})).resolves.toBeNull();
    expect(NtfyService.notifyDomainRemoved).toHaveBeenCalledWith('example.com', 'Postal Project', project.id);
  });
});
