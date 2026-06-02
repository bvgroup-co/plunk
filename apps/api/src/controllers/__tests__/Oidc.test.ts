import {AuthMethod} from '@plunk/db';
import {createLocalJWKSet, exportJWK, generateKeyPair, SignJWT} from 'jose';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {factories, getPrismaClient} from '../../../../../test/helpers';
import {OIDC_CLIENT_ID, OIDC_ISSUER} from '../../app/constants';
import {redis} from '../../database/redis';
import {
  completeOidcCallback,
  extractVerifiedOidcClaims,
  verifyOidcIdToken,
  type VerifiedOidcClaims,
} from '../Oauth/Oidc';
import {Keys} from '../../services/keys';

vi.mock('../../services/NtfyService.js', () => ({
  NtfyService: {
    notifyUserOAuthSignup: vi.fn(),
  },
}));

const prisma = getPrismaClient();
const validClaims: VerifiedOidcClaims = {
  iss: OIDC_ISSUER,
  sub: 'oidc-subject-1',
  email: 'oidc-user@example.com',
  emailVerified: true,
};

const unverifiedClaims: VerifiedOidcClaims = {
  ...validClaims,
  sub: 'oidc-unverified-subject',
  emailVerified: false,
};

async function createIdToken(nonce: string) {
  const {publicKey, privateKey} = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = 'oidc-test-key';
  const jwks = createLocalJWKSet({keys: [{...publicJwk, kid}]});

  const idToken = await new SignJWT({nonce, email: validClaims.email, email_verified: true})
    .setProtectedHeader({alg: 'RS256', kid})
    .setIssuer(OIDC_ISSUER)
    .setAudience(OIDC_CLIENT_ID)
    .setSubject(validClaims.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  return {idToken, jwks};
}

describe('OIDC callback security invariants', () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  it('creates and caches a verified OIDC user on first sign-in', async () => {
    const result = await completeOidcCallback(validClaims);

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('OIDC callback did not create a user');
    }

    const user = await prisma.user.findUniqueOrThrow({where: {id: result.userId}});
    expect(user).toMatchObject({
      email: validClaims.email,
      password: null,
      type: AuthMethod.OIDC,
      emailVerified: true,
      oidcIssuer: validClaims.iss,
      oidcSubject: validClaims.sub,
    });

    await expect(redis.get(Keys.User.id(user.id))).resolves.not.toBeNull();
    await expect(redis.get(Keys.User.email(user.email))).resolves.not.toBeNull();
  });

  it('rejects responses without required identity claims', () => {
    expect(extractVerifiedOidcClaims({iss: validClaims.iss, email: validClaims.email, email_verified: true})).toBe(
      'OIDC response did not include required identity claims',
    );
  });

  it('rejects unverified email claims when verification is required', () => {
    expect(
      extractVerifiedOidcClaims({
        iss: validClaims.iss,
        sub: validClaims.sub,
        email: validClaims.email,
        email_verified: false,
      }),
    ).toBe('OIDC email address is not verified');
  });

  it('rejects ID tokens whose nonce does not match the stored OIDC state', async () => {
    const {idToken, jwks} = await createIdToken('provider-nonce');

    await expect(verifyOidcIdToken(idToken, 'stored-state-nonce', jwks)).rejects.toThrow('OIDC nonce mismatch');
  });

  it('does not link an OIDC subject to an existing password account with the same email', async () => {
    await factories.createUser({email: validClaims.email, type: AuthMethod.PASSWORD});

    await expect(completeOidcCallback(validClaims)).resolves.toEqual({
      status: 'failure',
      reason: 'An account with this email already exists',
    });

    await expect(
      prisma.user.findUnique({
        where: {
          oidcIssuer_oidcSubject: {
            oidcIssuer: validClaims.iss,
            oidcSubject: validClaims.sub,
          },
        },
      }),
    ).resolves.toBeNull();
  });

  it('links an existing password user by verified email when explicitly enabled', async () => {
    vi.stubEnv('OIDC_LINK_EXISTING_BY_VERIFIED_EMAIL', 'true');
    const {user: existingUser, project} = await factories.createUserWithProject({
      email: validClaims.email.toUpperCase(),
      type: AuthMethod.PASSWORD,
    });

    await redis.set(Keys.User.id(existingUser.id), JSON.stringify(existingUser), 'EX', 60 * 60);
    await redis.set(Keys.User.email(validClaims.email), JSON.stringify(existingUser), 'EX', 60);

    const result = await completeOidcCallback(validClaims);

    expect(result).toEqual({status: 'success', userId: existingUser.id, isNewUser: false});

    const user = await prisma.user.findUniqueOrThrow({where: {id: existingUser.id}});
    expect(user).toMatchObject({
      id: existingUser.id,
      email: existingUser.email,
      password: null,
      type: AuthMethod.OIDC,
      emailVerified: true,
      oidcIssuer: validClaims.iss,
      oidcSubject: validClaims.sub,
    });

    await expect(
      prisma.membership.findFirst({where: {userId: existingUser.id, projectId: project.id}}),
    ).resolves.toBeTruthy();
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(redis.get(Keys.User.id(existingUser.id))).resolves.toContain('oidc-subject-1');
    await expect(redis.get(Keys.User.email(existingUser.email))).resolves.toContain('oidc-subject-1');
    await expect(redis.get(Keys.User.email(validClaims.email))).resolves.toContain('oidc-subject-1');
  });

  it('does not link an existing user when the OIDC email is unverified', async () => {
    vi.stubEnv('OIDC_LINK_EXISTING_BY_VERIFIED_EMAIL', 'true');
    const existingUser = await factories.createUser({email: unverifiedClaims.email, type: AuthMethod.PASSWORD});

    await expect(completeOidcCallback(unverifiedClaims)).resolves.toEqual({
      status: 'failure',
      reason: 'OIDC email address is not verified',
    });

    const user = await prisma.user.findUniqueOrThrow({where: {id: existingUser.id}});
    expect(user).toMatchObject({
      type: AuthMethod.PASSWORD,
      oidcIssuer: null,
      oidcSubject: null,
    });
  });

  it('does not overwrite an existing OIDC identity when linking by email', async () => {
    vi.stubEnv('OIDC_LINK_EXISTING_BY_VERIFIED_EMAIL', 'true');
    const existingUser = await prisma.user.create({
      data: {
        email: validClaims.email,
        type: AuthMethod.OIDC,
        emailVerified: true,
        oidcIssuer: validClaims.iss,
        oidcSubject: 'existing-oidc-subject',
      },
    });

    await expect(completeOidcCallback(validClaims)).resolves.toEqual({
      status: 'failure',
      reason: 'An account with this email already exists',
    });

    const user = await prisma.user.findUniqueOrThrow({where: {id: existingUser.id}});
    expect(user.oidcSubject).toBe('existing-oidc-subject');
  });

  it('allows verified-email linking when OIDC signups are disabled but rejects new users', async () => {
    vi.stubEnv('OIDC_LINK_EXISTING_BY_VERIFIED_EMAIL', 'true');
    vi.stubEnv('OIDC_ALLOW_SIGNUPS', 'false');
    const existingUser = await factories.createUser({email: validClaims.email, type: AuthMethod.PASSWORD});

    await expect(completeOidcCallback(validClaims)).resolves.toEqual({
      status: 'success',
      userId: existingUser.id,
      isNewUser: false,
    });

    await expect(
      completeOidcCallback({
        ...validClaims,
        sub: 'new-user-subject',
        email: 'new-oidc-user@example.com',
      }),
    ).resolves.toEqual({
      status: 'failure',
      reason: 'New user signups are currently disabled',
    });

    await expect(prisma.user.count()).resolves.toBe(1);
  });
});
