import useSWR from 'swr';

export interface ConfigResponse {
  environment: string;
  urls: {
    api: string;
    dashboard: string;
    landing: string;
    wiki: string | null;
  };
  features: {
    billing: {enabled: boolean};
    storage: {s3Enabled: boolean};
    auth: {
      mode: 'oidc' | 'password' | 'oauth';
      password: {enabled: boolean; signupEnabled: boolean};
      oidc: {enabled: boolean; displayName: string};
      oauth: {enabled: boolean; google: boolean; github: boolean};
    };
    authProviders: {github: boolean; google: boolean; oidc: boolean; oidcDisplayName: string};
    email: {trackingToggleEnabled: boolean};
    smtp: {
      enabled: boolean;
      domain: string | null;
      ports: {secure: number; submission: number} | null;
    };
  };
  aws: {
    sesRegion: string;
    mailFromSubdomain: string;
  };
}

/**
 * Fetch global instance configuration and feature flags.
 *
 * - `data` is undefined while loading, then a ConfigResponse on success.
 * - Errors do not retry by default.
 */
export function useConfig() {
  return useSWR<ConfigResponse>('/config', {shouldRetryOnError: false});
}
