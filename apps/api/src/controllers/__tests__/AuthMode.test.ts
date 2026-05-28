import {describe, expect, it, vi} from 'vitest';

async function importConstantsWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();

  const previousEnv = {...process.env};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await import('../../app/constants.js');
  } finally {
    process.env = previousEnv;
    vi.resetModules();
  }
}

describe('AUTH_MODE constants', () => {
  it('defaults to password mode and disables provider auth', async () => {
    const constants = await importConstantsWithEnv({
      AUTH_MODE: undefined,
      NODE_ENV: 'test',
      OIDC_ISSUER: 'https://issuer.example.com',
      OIDC_CLIENT_ID: 'client',
      OIDC_CLIENT_SECRET: 'secret',
      GITHUB_OAUTH_CLIENT: 'github-client',
      GITHUB_OAUTH_SECRET: 'github-secret',
      GOOGLE_OAUTH_CLIENT: 'google-client',
      GOOGLE_OAUTH_SECRET: 'google-secret',
    });

    expect(constants.AUTH_MODE).toBe('password');
    expect(constants.PASSWORD_AUTH_ENABLED).toBe(true);
    expect(constants.OAUTH_AUTH_ENABLED).toBe(false);
    expect(constants.OIDC_AUTH_ENABLED).toBe(false);
    expect(constants.OIDC_ENABLED).toBe(false);
    expect(constants.GITHUB_OAUTH_ENABLED).toBe(false);
    expect(constants.GOOGLE_OAUTH_ENABLED).toBe(false);
  });

  it('enables only OIDC in oidc mode', async () => {
    const constants = await importConstantsWithEnv({
      AUTH_MODE: 'oidc',
      NODE_ENV: 'test',
      OIDC_ISSUER: 'https://issuer.example.com/',
      OIDC_CLIENT_ID: 'client',
      OIDC_CLIENT_SECRET: 'secret',
      GITHUB_OAUTH_CLIENT: 'github-client',
      GITHUB_OAUTH_SECRET: 'github-secret',
      GOOGLE_OAUTH_CLIENT: 'google-client',
      GOOGLE_OAUTH_SECRET: 'google-secret',
    });

    expect(constants.PASSWORD_AUTH_ENABLED).toBe(false);
    expect(constants.OAUTH_AUTH_ENABLED).toBe(false);
    expect(constants.OIDC_AUTH_ENABLED).toBe(true);
    expect(constants.OIDC_ENABLED).toBe(true);
    expect(constants.OIDC_ISSUER).toBe('https://issuer.example.com');
    expect(constants.GITHUB_OAUTH_ENABLED).toBe(false);
    expect(constants.GOOGLE_OAUTH_ENABLED).toBe(false);
  });

  it('enables only configured OAuth providers in oauth mode', async () => {
    const constants = await importConstantsWithEnv({
      AUTH_MODE: 'oauth',
      NODE_ENV: 'test',
      OIDC_ISSUER: 'https://issuer.example.com',
      OIDC_CLIENT_ID: 'client',
      OIDC_CLIENT_SECRET: 'secret',
      GITHUB_OAUTH_CLIENT: 'github-client',
      GITHUB_OAUTH_SECRET: 'github-secret',
      GOOGLE_OAUTH_CLIENT: '',
      GOOGLE_OAUTH_SECRET: '',
    });

    expect(constants.PASSWORD_AUTH_ENABLED).toBe(false);
    expect(constants.OAUTH_AUTH_ENABLED).toBe(true);
    expect(constants.OIDC_AUTH_ENABLED).toBe(false);
    expect(constants.OIDC_ENABLED).toBe(false);
    expect(constants.GITHUB_OAUTH_ENABLED).toBe(true);
    expect(constants.GOOGLE_OAUTH_ENABLED).toBe(false);
  });

  it('rejects invalid auth modes at startup', async () => {
    await expect(importConstantsWithEnv({AUTH_MODE: 'saml', NODE_ENV: 'test'})).rejects.toThrow(
      'AUTH_MODE must be one of: oidc, password, oauth',
    );
  });
});
