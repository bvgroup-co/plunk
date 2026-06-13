import type {Domain} from '@plunk/db';
import {DomainSchemas} from '@plunk/shared';
import useSWR from 'swr';

import {network} from '../network';

export interface DnsRecord {
  type: string;
  host: string;
  value: string;
  priority?: number;
  required?: boolean;
  purpose?: string;
  status?: string | null;
  error?: string | null;
}

export interface DomainVerificationStatus {
  domain: string;
  tokens: string[];
  records: DnsRecord[];
  status: string;
  verified: boolean;
  provider: 'ses' | 'sendgrid' | 'postal';
}

/**
 * Hook to fetch domains for a project
 */
export function useDomains(projectId: string | undefined) {
  const {data, error, mutate, isLoading} = useSWR<Domain[]>(projectId ? `/domains/project/${projectId}` : null);

  return {
    domains: data,
    error,
    isLoading,
    mutate,
  };
}

/**
 * Hook to add a domain
 */
export function useAddDomain() {
  const addDomain = async (projectId: string, domain: string) => {
    return network.fetch<Domain, typeof DomainSchemas.create>('POST', '/domains', {
      projectId,
      domain,
    });
  };

  return {addDomain};
}

/**
 * Hook to check domain verification status
 */
export function useCheckDomainVerification() {
  const checkVerification = async (domainId: string) => {
    return network.fetch<DomainVerificationStatus>('GET', `/domains/${domainId}/verify`);
  };

  return {checkVerification};
}

/**
 * Hook to remove a domain
 */
export function useRemoveDomain() {
  const removeDomain = async (domainId: string) => {
    return network.fetch<{success: boolean}>('DELETE', `/domains/${domainId}`);
  };

  return {removeDomain};
}
