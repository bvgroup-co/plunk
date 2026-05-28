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
});
