import {Controller, Get} from '@overnightjs/core';
import type {User} from '@plunk/db';
import {createHash, randomBytes} from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';
import {createRemoteJWKSet, jwtVerify} from 'jose';
import type {JWTPayload, JWTVerifyGetKey} from 'jose';

import {
  API_URI,
  DASHBOARD_URI,
  OIDC_ALLOW_SIGNUPS,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_DISPLAY_NAME,
  OIDC_EMAIL_CLAIM,
  OIDC_EMAIL_VERIFIED_CLAIM,
  OIDC_ENABLED,
  OIDC_ISSUER,
  OIDC_LINK_EXISTING_BY_VERIFIED_EMAIL,
  OIDC_REQUIRE_EMAIL_VERIFIED,
  OIDC_SCOPES,
} from '../../app/constants.js';
import {prisma} from '../../database/prisma.js';
import {redis} from '../../database/redis.js';
import {jwt} from '../../middleware/auth.js';
import {NtfyService} from '../../services/NtfyService.js';
import {UserService} from '../../services/UserService.js';
import {Keys} from '../../services/keys.js';
import {CatchAsync} from '../../utils/asyncHandler.js';

const OIDC_STATE_TTL_SECONDS = 10 * 60;
const CODE_VERIFIER_BYTE_LENGTH = 32;
const STATE_BYTE_LENGTH = 32;
const NONCE_BYTE_LENGTH = 32;
const OIDC_REDIRECT_PATH = '/oauth/oidc/callback';

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

type OidcState = {
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

type OidcTokenResponse = {
  id_token?: unknown;
  error?: unknown;
  error_description?: unknown;
};

export type VerifiedOidcClaims = {
  iss: string;
  sub: string;
  email: string;
  emailVerified: boolean;
};

export type OidcCallbackResult =
  | {status: 'success'; userId: string; isNewUser: boolean}
  | {status: 'failure'; reason: string};

function redirectToLogin(res: Response, reason: string) {
  return res.redirect(`${DASHBOARD_URI}/auth/login?message=${encodeURIComponent(reason)}`);
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

function generateRandomValue(byteLength: number): string {
  return base64Url(randomBytes(byteLength));
}

function createCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

function getRedirectUri(): string {
  return `${API_URI}${OIDC_REDIRECT_PATH}`;
}

function getClaimAsString(payload: JWTPayload, claimName: string): string | null {
  const value = payload[claimName];

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  return value;
}

function getEmailVerified(payload: JWTPayload): boolean {
  const value = payload[OIDC_EMAIL_VERIFIED_CLAIM];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return false;
}

export function extractVerifiedOidcClaims(payload: JWTPayload): VerifiedOidcClaims | string {
  const email = getClaimAsString(payload, OIDC_EMAIL_CLAIM);
  const emailVerified = getEmailVerified(payload);

  if (!payload.iss || !payload.sub || !email) {
    return 'OIDC response did not include required identity claims';
  }

  if (OIDC_REQUIRE_EMAIL_VERIFIED && !emailVerified) {
    return 'OIDC email address is not verified';
  }

  return {
    iss: payload.iss,
    sub: payload.sub,
    email,
    emailVerified,
  };
}

async function cacheUser(user: User, emailLookup = user.email) {
  await redis.set(Keys.User.id(user.id), JSON.stringify(user), 'EX', 60 * 60);
  await redis.set(Keys.User.email(user.email), JSON.stringify(user), 'EX', 60);

  if (emailLookup !== user.email) {
    await redis.set(Keys.User.email(emailLookup), JSON.stringify(user), 'EX', 60);
  }
}

async function linkExistingUserByVerifiedEmail(
  claims: VerifiedOidcClaims,
  existingEmailUser: User,
): Promise<OidcCallbackResult> {
  if (!claims.emailVerified) {
    return {status: 'failure', reason: 'OIDC email address is not verified'};
  }

  const linkedUsers = await prisma.user.updateManyAndReturn({
    where: {
      id: existingEmailUser.id,
      email: {
        equals: claims.email,
        mode: 'insensitive',
      },
      oidcIssuer: null,
      oidcSubject: null,
    },
    data: {
      password: null,
      type: 'OIDC',
      emailVerified: true,
      oidcIssuer: claims.iss,
      oidcSubject: claims.sub,
    },
  });

  if (linkedUsers.length === 0) {
    return {status: 'failure', reason: 'An account with this email already exists'};
  }

  if (linkedUsers.length !== 1) {
    throw new Error('OIDC email linking matched multiple users');
  }

  const linkedUser = linkedUsers[0];

  if (!linkedUser) {
    throw new Error('OIDC email linking did not return the linked user');
  }

  await cacheUser(linkedUser, claims.email);

  return {status: 'success', userId: linkedUser.id, isNewUser: false};
}

export async function completeOidcCallback(claims: VerifiedOidcClaims): Promise<OidcCallbackResult> {
  let user = await prisma.user.findUnique({
    where: {
      oidcIssuer_oidcSubject: {
        oidcIssuer: claims.iss,
        oidcSubject: claims.sub,
      },
    },
  });
  let isNewUser = false;

  if (!user) {
    const existingEmailUser = await UserService.email(claims.email);

    if (existingEmailUser) {
      if (OIDC_LINK_EXISTING_BY_VERIFIED_EMAIL) {
        return linkExistingUserByVerifiedEmail(claims, existingEmailUser);
      }

      return {status: 'failure', reason: 'An account with this email already exists'};
    }

    if (!OIDC_ALLOW_SIGNUPS) {
      return {status: 'failure', reason: 'New user signups are currently disabled'};
    }

    user = await prisma.user.create({
      data: {
        email: claims.email,
        password: null,
        type: 'OIDC',
        emailVerified: true,
        oidcIssuer: claims.iss,
        oidcSubject: claims.sub,
      },
    });
    isNewUser = true;
  }

  if (user.type !== 'OIDC') {
    return {status: 'failure', reason: 'You used another form of authentication'};
  }

  if (isNewUser) {
    await NtfyService.notifyUserOAuthSignup(user.email, user.id, OIDC_DISPLAY_NAME);
  }

  await cacheUser(user);

  return {status: 'success', userId: user.id, isNewUser};
}

export async function verifyOidcIdToken(idToken: string, nonce: string, jwks: JWTVerifyGetKey): Promise<JWTPayload> {
  const {payload} = await jwtVerify(idToken, jwks, {
    issuer: OIDC_ISSUER,
    audience: OIDC_CLIENT_ID,
    maxTokenAge: '10 minutes',
  });

  if (payload.nonce !== nonce) {
    throw new Error('OIDC nonce mismatch');
  }

  return payload;
}

export class OidcConfigurationService {
  private static discovery: OidcDiscovery | null = null;
  private static jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  public static async discover(): Promise<OidcDiscovery> {
    if (this.discovery) {
      return this.discovery;
    }

    const response = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new Error('Failed to load OIDC configuration');
    }

    const discovery = (await response.json()) as Partial<OidcDiscovery>;

    if (discovery.issuer !== OIDC_ISSUER) {
      throw new Error('OIDC issuer mismatch');
    }

    if (!discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.jwks_uri) {
      throw new Error('OIDC configuration is missing required endpoints');
    }

    this.discovery = {
      authorization_endpoint: discovery.authorization_endpoint,
      token_endpoint: discovery.token_endpoint,
      jwks_uri: discovery.jwks_uri,
      issuer: discovery.issuer,
    };

    return this.discovery;
  }

  public static async getJwks() {
    if (this.jwks) {
      return this.jwks;
    }

    const discovery = await this.discover();
    this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));

    return this.jwks;
  }
}

@Controller('oidc')
export class Oidc {
  @Get('outbound')
  @CatchAsync
  public async sendToOutbound(_req: Request, res: Response, _next: NextFunction) {
    if (!OIDC_ENABLED) {
      return redirectToLogin(res, 'OIDC is not configured');
    }

    const discovery = await OidcConfigurationService.discover();
    const state = generateRandomValue(STATE_BYTE_LENGTH);
    const nonce = generateRandomValue(NONCE_BYTE_LENGTH);
    const codeVerifier = generateRandomValue(CODE_VERIFIER_BYTE_LENGTH);
    const codeChallenge = createCodeChallenge(codeVerifier);
    const stateRecord: OidcState = {nonce, codeVerifier, createdAt: Date.now()};

    await redis.setex(Keys.Oidc.state(state), OIDC_STATE_TTL_SECONDS, JSON.stringify(stateRecord));

    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', OIDC_CLIENT_ID);
    authorizationUrl.searchParams.set('redirect_uri', getRedirectUri());
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', OIDC_SCOPES);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    return res.redirect(authorizationUrl.toString());
  }

  @Get('callback')
  @CatchAsync
  public async callback(req: Request, res: Response, _next: NextFunction) {
    if (!OIDC_ENABLED) {
      return redirectToLogin(res, 'OIDC is not configured');
    }

    const {code, state} = req.query;

    if (typeof code !== 'string' || typeof state !== 'string') {
      return redirectToLogin(res, 'Invalid OIDC callback');
    }

    try {
      const stateKey = Keys.Oidc.state(state);
      const stateRecordJson = await redis.get(stateKey);
      await redis.del(stateKey);

      if (!stateRecordJson) {
        return redirectToLogin(res, 'OIDC session expired');
      }

      const stateRecord = JSON.parse(stateRecordJson) as OidcState;
      const discovery = await OidcConfigurationService.discover();
      const tokenResponse = await this.exchangeCode(discovery.token_endpoint, code, stateRecord.codeVerifier);

      if (typeof tokenResponse.id_token !== 'string') {
        return redirectToLogin(res, this.getTokenError(tokenResponse));
      }

      const claims = extractVerifiedOidcClaims(await this.verifyIdToken(tokenResponse.id_token, stateRecord.nonce));

      if (typeof claims === 'string') {
        return redirectToLogin(res, claims);
      }

      const callbackResult = await completeOidcCallback(claims);

      if (callbackResult.status === 'failure') {
        return redirectToLogin(res, callbackResult.reason);
      }

      const token = jwt.sign(callbackResult.userId);
      const cookie = UserService.cookieOptions();

      return res.cookie(UserService.COOKIE_NAME, token, cookie).redirect(DASHBOARD_URI);
    } catch (error) {
      if (error instanceof Error) {
        return redirectToLogin(res, error.message);
      }

      return redirectToLogin(res, 'Failed to authenticate with OIDC');
    }
  }

  private async exchangeCode(tokenEndpoint: string, code: string, codeVerifier: string): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OIDC_CLIENT_ID,
      client_secret: OIDC_CLIENT_SECRET,
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
    });

    return (await response.json()) as OidcTokenResponse;
  }

  private async verifyIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
    return verifyOidcIdToken(idToken, nonce, await OidcConfigurationService.getJwks());
  }

  private getTokenError(tokenResponse: OidcTokenResponse): string {
    if (typeof tokenResponse.error_description === 'string') {
      return tokenResponse.error_description;
    }

    if (typeof tokenResponse.error === 'string') {
      return tokenResponse.error;
    }

    return 'Failed to authenticate with OIDC';
  }
}
