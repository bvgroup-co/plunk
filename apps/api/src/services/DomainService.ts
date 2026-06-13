import React from 'react';
import signale from 'signale';
import {DomainUnverifiedEmail, DomainVerifiedEmail, sendPlatformEmail} from '@plunk/email';
import {
  DASHBOARD_URI,
  EMAIL_PROVIDER,
  SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY,
  SENDGRID_DOMAIN_AUTH_DEFAULT,
  SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
} from '../app/constants.js';
import {prisma} from '../database/prisma.js';
import {redis, wrapRedis} from '../database/redis.js';
import {HttpException} from '../exceptions/index.js';
import {sendGridRequest} from '../utils/sendgrid.js';
import {Keys} from './keys.js';
import {MembershipService} from './MembershipService.js';
import {NtfyService} from './NtfyService.js';
import {checkPostalDomain, createPostalDomain, deletePostalDomain, type PostalDomainResponse} from './PostalDomainClient.js';
import {
  deleteIdentity,
  disableFeedbackForwarding,
  getDomainVerificationAttributes,
  verifyDomain,
} from './SESService.js';

type DnsRecord = {
  type: string;
  host: string;
  value: string;
  priority?: number;
  required?: boolean;
  purpose?: string;
  status?: string | null;
  error?: string | null;
};

type SendGridDnsRecord = {
  type: string;
  host: string;
  data: string;
  valid?: boolean;
};

type SendGridDomainResponse = {
  id: number;
  domain: string;
  subdomain?: string;
  valid?: boolean;
  dns?: Record<string, SendGridDnsRecord>;
};

type SendGridValidateResponse = {
  valid: boolean;
  validation_results?: Record<string, {valid: boolean; reason?: string}>;
};

function serializeRecords(records: DnsRecord[]): DnsRecord[] {
  return records.map(record => ({
    type: record.type.toUpperCase(),
    host: record.host,
    value: record.value,
    ...(record.priority !== undefined ? {priority: record.priority} : {}),
    ...(record.required !== undefined ? {required: record.required} : {}),
    ...(record.purpose !== undefined ? {purpose: record.purpose} : {}),
    ...(record.status !== undefined ? {status: record.status} : {}),
    ...(record.error !== undefined ? {error: record.error} : {}),
  }));
}

function recordsFromSendGrid(response: SendGridDomainResponse): DnsRecord[] {
  return serializeRecords(
    Object.values(response.dns ?? {}).map(record => ({
      type: record.type,
      host: record.host,
      value: record.data,
    })),
  );
}

function postalProviderData(response: PostalDomainResponse) {
  return {
    id: response.id,
    ...(response.uuid ? {uuid: response.uuid} : {}),
    name: response.name,
    verified: response.verified,
    records: response.records,
    ...(response.statuses ? {statuses: response.statuses} : {}),
    raw: response.raw,
  };
}

async function parseSendGridJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export class DomainService {
  /**
   * Get a domain by ID
   */
  public static async id(id: string) {
    return wrapRedis(Keys.Domain.id(id), async () => {
      return prisma.domain.findUnique({where: {id}});
    });
  }

  /**
   * Get all domains for a project
   */
  public static async getProjectDomains(projectId: string) {
    return wrapRedis(Keys.Domain.project(projectId), async () => {
      return prisma.domain.findMany({
        where: {projectId},
        orderBy: {createdAt: 'desc'},
      });
    });
  }

  /**
   * Add a new domain to a project and start verification
   */
  public static async addDomain(projectId: string, domain: string) {
    switch (EMAIL_PROVIDER) {
      case 'postal':
        return DomainService.addPostalDomain(projectId, domain);
      case 'sendgrid':
        return DomainService.addSendGridDomain(projectId, domain);
      case 'ses':
        return DomainService.addSesDomain(projectId, domain);
    }
  }

  private static async addSesDomain(projectId: string, domain: string) {
    const dkimTokens = await verifyDomain(domain);

    const newDomain = await prisma.domain.create({
      data: {
        projectId,
        domain,
        verified: false,
        dkimTokens,
      },
      include: {
        project: {
          select: {name: true},
        },
      },
    });

    await NtfyService.notifyDomainAdded(domain, newDomain.project.name, projectId);

    return newDomain;
  }

  private static async addSendGridDomain(projectId: string, domain: string) {
    const sendGridDomain = await parseSendGridJson<SendGridDomainResponse>(
      await sendGridRequest('/v3/whitelabel/domains', {
        method: 'POST',
        body: JSON.stringify({
          domain,
          subdomain: SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
          automatic_security: SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY,
          default: SENDGRID_DOMAIN_AUTH_DEFAULT,
        }),
      }),
    );
    const records = recordsFromSendGrid(sendGridDomain);

    const newDomain = await prisma.domain.create({
      data: {
        projectId,
        domain,
        provider: 'SENDGRID',
        verified: Boolean(sendGridDomain.valid),
        dkimTokens: [],
        providerDomainId: String(sendGridDomain.id),
        providerSubdomain: sendGridDomain.subdomain ?? SENDGRID_DOMAIN_AUTH_SUBDOMAIN,
        providerRecords: records,
        providerData: sendGridDomain,
      },
      include: {
        project: {
          select: {name: true},
        },
      },
    });

    await NtfyService.notifyDomainAdded(domain, newDomain.project.name, projectId);

    return newDomain;
  }

  private static async addPostalDomain(projectId: string, domain: string) {
    const postalDomain = await createPostalDomain(domain);
    const records = serializeRecords(postalDomain.records);

    const newDomain = await prisma.domain.create({
      data: {
        projectId,
        domain,
        provider: 'POSTAL',
        verified: postalDomain.verified,
        dkimTokens: [],
        providerDomainId: postalDomain.id,
        providerRecords: records,
        providerData: postalProviderData(postalDomain),
      },
      include: {
        project: {
          select: {name: true},
        },
      },
    });

    await NtfyService.notifyDomainAdded(domain, newDomain.project.name, projectId);

    return newDomain;
  }

  /**
   * Check verification status for a domain
   */
  public static async checkVerification(domainId: string) {
    const domain = await prisma.domain.findUnique({where: {id: domainId}});

    if (!domain) {
      throw new Error('Domain not found');
    }

    if (domain.provider === 'POSTAL') {
      if (!domain.providerDomainId) {
        throw new Error('Postal domain is missing provider domain ID');
      }

      const postalDomain = await checkPostalDomain(domain.providerDomainId);
      const records = serializeRecords(postalDomain.records);

      const updatedDomain = await prisma.domain.update({
        where: {id: domainId},
        data: {
          verified: postalDomain.verified,
          lastCheckedAt: new Date(),
          verifiedAt: postalDomain.verified ? new Date() : null,
          providerRecords: records,
          providerData: postalProviderData(postalDomain),
          providerError: null,
        },
      });

      return {
        domain: updatedDomain.domain,
        tokens: [],
        records,
        status: postalDomain.verified ? 'Success' : 'Pending',
        verified: postalDomain.verified,
        provider: 'postal',
      };
    }

    if (domain.provider === 'SENDGRID') {
      if (!domain.providerDomainId) {
        throw new Error('SendGrid domain is missing provider domain ID');
      }

      const validation = await parseSendGridJson<SendGridValidateResponse>(
        await sendGridRequest(`/v3/whitelabel/domains/${domain.providerDomainId}/validate`, {method: 'POST'}),
      );
      const verified = validation.valid;

      const updatedDomain = await prisma.domain.update({
        where: {id: domainId},
        data: {
          verified,
          lastCheckedAt: new Date(),
          verifiedAt: verified ? new Date() : null,
          providerData: validation,
          providerError: verified ? null : JSON.stringify(validation.validation_results ?? {}),
        },
      });

      return {
        domain: updatedDomain.domain,
        tokens: [],
        records: (updatedDomain.providerRecords as DnsRecord[] | null) ?? [],
        status: verified ? 'Success' : 'Pending',
        verified,
        provider: 'sendgrid',
      };
    }

    const attributes = await getDomainVerificationAttributes(domain.domain);

    // If domain failed verification, retry
    if (attributes.status === 'Failed') {
      signale.warn(`[DOMAIN-SERVICE] Restarting verification for ${domain.domain}`);

      let attempt = 0;
      const maxAttempts = 5;
      let success = false;
      let delay = 5000;

      while (attempt < maxAttempts && !success) {
        try {
          await verifyDomain(domain.domain);
          success = true;
          signale.success(`[DOMAIN-SERVICE] Restarted verification for ${domain.domain}`);
        } catch (e: unknown) {
          const error = e as {Code?: string; name?: string; message?: string};
          if (error?.Code === 'Throttling' || error?.name === 'Throttling' || error?.message?.includes('Throttling')) {
            signale.warn(
              `[DOMAIN-SERVICE] Throttling detected, waiting ${delay / 1000} seconds (attempt ${attempt + 1})`,
            );
            await new Promise(r => setTimeout(r, delay));
            delay *= 2; // Exponential backoff
            attempt++;
          } else {
            signale.error(`[DOMAIN-SERVICE] Error restarting verification: ${error?.message || 'Unknown error'}`);
            throw e;
          }
        }
      }

      if (!success) {
        signale.error(
          `[DOMAIN-SERVICE] Failed to verify ${domain.domain} after ${maxAttempts} attempts due to throttling`,
        );
      }
    }

    // Update domain if verification status changed
    if (attributes.status === 'Success' && !domain.verified) {
      const updatedDomain = await prisma.domain.update({
        where: {id: domainId},
        data: {verified: true},
        include: {
          project: {
            select: {name: true, id: true},
          },
        },
      });

      // Disable feedback forwarding for verified domain
      try {
        await disableFeedbackForwarding(domain.domain);
        signale.info(`[DOMAIN-SERVICE] Disabled feedback forwarding for ${domain.domain}`);
      } catch (error) {
        signale.error(`[DOMAIN-SERVICE] Error disabling feedback forwarding for ${domain.domain}:`, error);
      }

      // Send notification about domain verified
      await NtfyService.notifyDomainVerified(domain.domain, updatedDomain.project.name, updatedDomain.project.id);

      // Send email notification about domain verified
      try {
        // Use SETNX to atomically check and set the flag (prevents race conditions)
        const cacheKey = Keys.Domain.verifiedEmail(domainId);
        const ttl = 604800; // 7 days

        // SETNX returns 1 if key was set (didn't exist), 0 if key already existed
        const wasSet = await redis.set(cacheKey, '1', 'EX', ttl, 'NX');
        if (wasSet) {
          const members = await MembershipService.getMembers(updatedDomain.project.id);
          const emails = members.map(m => m.email);
          if (emails.length > 0) {
            const template = React.createElement(DomainVerifiedEmail, {
              projectName: updatedDomain.project.name,
              projectId: updatedDomain.project.id,
              domain: domain.domain,
              dashboardUrl: DASHBOARD_URI,
            });
            await Promise.all(emails.map(email => sendPlatformEmail(email, 'Domain Verified Successfully', template)));
          }
        }
      } catch (emailError) {
        signale.error('[DOMAIN-EMAIL] Failed to send domain verified email:', emailError);
      }
    } else if (attributes.status !== 'Success' && domain.verified) {
      const updatedDomain = await prisma.domain.update({
        where: {id: domainId},
        data: {verified: false},
        include: {
          project: {
            select: {name: true, id: true},
          },
        },
      });

      // Send notification about domain verification failed
      await NtfyService.notifyDomainVerificationFailed(
        domain.domain,
        updatedDomain.project.name,
        updatedDomain.project.id,
      );

      // Send email notification about domain verification failed
      try {
        // Use SETNX to atomically check and set the flag (prevents race conditions)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const cacheKey = Keys.Domain.unverifiedEmail(domainId, year, month);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const ttl = Math.floor((endOfMonth.getTime() - now.getTime()) / 1000);

        // SETNX returns 1 if key was set (didn't exist), 0 if key already existed
        const wasSet = await redis.set(cacheKey, '1', 'EX', ttl, 'NX');
        if (wasSet) {
          const members = await MembershipService.getMembers(updatedDomain.project.id);
          const emails = members.map(m => m.email);
          if (emails.length > 0) {
            const template = React.createElement(DomainUnverifiedEmail, {
              projectName: updatedDomain.project.name,
              projectId: updatedDomain.project.id,
              domain: domain.domain,
              dashboardUrl: DASHBOARD_URI,
            });
            await Promise.all(emails.map(email => sendPlatformEmail(email, 'Domain Verification Failed', template)));
          }
        }
      } catch (emailError) {
        signale.error('[DOMAIN-EMAIL] Failed to send domain unverified email:', emailError);
      }
    }

    return {
      domain: domain.domain,
      tokens: attributes.tokens,
      records: [],
      status: attributes.status,
      verified: attributes.status === 'Success',
      provider: 'ses',
    };
  }

  /**
   * Remove a domain from a project
   */
  public static async removeDomain(domainId: string) {
    const domain = await prisma.domain.findUnique({
      where: {id: domainId},
      include: {
        project: {
          select: {name: true, id: true},
        },
      },
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    // Extract domain name for checking usage
    const domainName = domain.domain;

    // Check if domain is used in any templates
    const templatesUsingDomain = await prisma.template.count({
      where: {
        projectId: domain.projectId,
        from: {
          contains: `@${domainName}`,
        },
      },
    });

    if (templatesUsingDomain > 0) {
      throw new HttpException(
        409,
        `Cannot delete domain: it is currently used in ${templatesUsingDomain} template(s). Update the templates first.`,
      );
    }

    // Check if domain is used in any workflow steps (via templates)
    const workflowStepsUsingDomain = await prisma.workflowStep.count({
      where: {
        workflow: {
          projectId: domain.projectId,
        },
        template: {
          from: {
            contains: `@${domainName}`,
          },
        },
      },
    });

    if (workflowStepsUsingDomain > 0) {
      throw new HttpException(
        409,
        `Cannot delete domain: it is currently used in ${workflowStepsUsingDomain} workflow step(s). Update the workflow templates first.`,
      );
    }

    // Check if domain is used in any active campaigns
    const campaignsUsingDomain = await prisma.campaign.count({
      where: {
        projectId: domain.projectId,
        from: {
          contains: `@${domainName}`,
        },
        status: {
          in: ['DRAFT', 'SCHEDULED', 'SENDING'],
        },
      },
    });

    if (campaignsUsingDomain > 0) {
      throw new HttpException(
        409,
        `Cannot delete domain: it is currently used in ${campaignsUsingDomain} active campaign(s). Update or complete the campaigns first.`,
      );
    }

    // Check if this domain is still attached to another project
    const domainExistsElsewhere = await prisma.domain.findFirst({
      where: {
        domain: domainName,
        id: {not: domainId},
      },
    });

    if (!domainExistsElsewhere) {
      if (domain.provider === 'SENDGRID') {
        if (domain.providerDomainId) {
          try {
            await sendGridRequest(`/v3/whitelabel/domains/${domain.providerDomainId}`, {method: 'DELETE'});
            signale.info(`[DOMAIN] Removed SendGrid domain authentication for ${domainName}`);
          } catch (error) {
            signale.error(`[DOMAIN] Failed to remove SendGrid domain authentication for ${domainName}:`, error);
          }
        }
      } else if (domain.provider === 'POSTAL') {
        if (domain.providerDomainId) {
          try {
            await deletePostalDomain(domain.providerDomainId);
            signale.info(`[DOMAIN] Removed Postal domain for ${domainName}`);
          } catch (error) {
            const cleanupError = error instanceof Error ? error.message : 'Postal domain cleanup failed';
            await prisma.domain.update({
              where: {id: domainId},
              data: {
                providerError: cleanupError,
              },
            });
            signale.error(
              `[DOMAIN] Failed to remove Postal domain for ${domainName}; manual cleanup may be required:`,
              error,
            );
            throw new HttpException(502, cleanupError);
          }
        } else {
          signale.warn(`[DOMAIN] Postal domain ${domainName} is missing provider ID; manual cleanup may be required`);
        }
      } else if (domain.provider === 'SES') {
        try {
          await deleteIdentity(domainName);
          signale.info(`[DOMAIN] Removed AWS SES identity for ${domainName} (no longer used by any project)`);
        } catch (error) {
          signale.error(`[DOMAIN] Failed to remove AWS SES identity for ${domainName}:`, error);
        }
      }
    } else {
      signale.info(
        `[DOMAIN] Keeping provider domain identity for ${domainName} (still used by project ${domainExistsElsewhere.projectId})`,
      );
    }

    await prisma.domain.delete({where: {id: domainId}});

    // Send notification about domain removal
    await NtfyService.notifyDomainRemoved(domainName, domain.project.name, domain.project.id);

    return true;
  }

  /**
   * Get verified domains for a project
   */
  public static async getVerifiedDomains(projectId: string) {
    return prisma.domain.findMany({
      where: {
        projectId,
        verified: true,
      },
    });
  }

  /**
   * Verify that an email domain belongs to the specified project and is verified
   * @param email Full email address (e.g., "hello@example.com")
   * @param projectId Project ID to verify ownership
   * @returns The verified domain object
   * @throws HttpException if domain not found, not owned by project, or not verified
   */
  public static async verifyEmailDomain(email: string, projectId: string) {
    // Extract domain from email
    const emailParts = email.split('@');
    if (emailParts.length !== 2) {
      throw new HttpException(400, 'Invalid email format');
    }

    const domainName = emailParts[1];

    // Find domain in database
    const domain = await prisma.domain.findFirst({
      where: {
        domain: domainName,
      },
    });

    if (!domain) {
      throw new HttpException(
        403,
        `Domain "${domainName}" is not registered. Please add and verify this domain in your project settings.`,
      );
    }

    // Verify domain belongs to the project
    if (domain.projectId !== projectId) {
      throw new HttpException(
        403,
        `Domain "${domainName}" belongs to a different project. You cannot use this domain.`,
      );
    }

    // Verify domain is verified
    if (!domain.verified) {
      throw new HttpException(
        403,
        `Domain "${domainName}" is not verified. Please complete the DNS verification process in your domain settings.`,
      );
    }

    return domain;
  }

  /**
   * Extract the registrable root domain (last two labels) from a domain name.
   * e.g. "mail.example.com" → "example.com", "example.com" → "example.com"
   */
  private static rootDomain(domain: string): string {
    const parts = domain.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : domain;
  }

  /**
   * Check whether the root domain of `domain` is owned by a disabled project.
   * Prevents subdomains from being added when the parent domain is flagged.
   */
  public static async checkSubdomainOfDisabledRoot(
    domain: string,
  ): Promise<{blocked: boolean; projectName?: string; projectId?: string}> {
    const root = this.rootDomain(domain);

    // Only relevant when the submitted domain is actually a subdomain
    if (root === domain) {
      return {blocked: false};
    }

    const rootDomainRecord = await prisma.domain.findFirst({
      where: {domain: root},
      include: {
        project: {
          select: {id: true, name: true, disabled: true},
        },
      },
    });

    if (rootDomainRecord?.project.disabled) {
      return {
        blocked: true,
        projectName: rootDomainRecord.project.name,
        projectId: rootDomainRecord.project.id,
      };
    }

    return {blocked: false};
  }

  /**
   * Check if a domain is already linked to another project
   * Used when adding a new domain to verify if the user has access to the existing project
   * @param domain Domain name to check
   * @param userId User ID to check membership
   * @returns Object with exists flag and membership info
   */
  public static async checkDomainOwnership(domain: string, userId?: string) {
    const existingDomain = await prisma.domain.findFirst({
      where: {domain},
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!existingDomain) {
      return {exists: false};
    }

    let isMember = false;

    if (userId) {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_projectId: {
            userId,
            projectId: existingDomain.project.id,
          },
        },
      });

      isMember = membership !== null;
    }

    return {
      exists: true,
      projectId: existingDomain.project.id,
      projectName: existingDomain.project.name,
      isMember,
    };
  }
}
