import {Controller, Get, Post} from '@overnightjs/core';
import type {NextFunction, Request, Response} from 'express';

import {HttpException} from '../exceptions/index.js';
import {UserService} from '../services/UserService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

function rejectLegacyAuth(): never {
  throw new HttpException(410, 'Password authentication is disabled. Use OIDC single sign-on.');
}

@Controller('auth')
export class Auth {
  @Post('login')
  @CatchAsync
  public async login(_req: Request, _res: Response, _next: NextFunction) {
    rejectLegacyAuth();
  }

  @Post('signup')
  @CatchAsync
  public async signup(_req: Request, _res: Response, _next: NextFunction) {
    rejectLegacyAuth();
  }

  @Get('logout')
  public logout(_req: Request, res: Response) {
    res.cookie(UserService.COOKIE_NAME, '', UserService.cookieOptions(new Date()));
    return res.json(true);
  }

  @Get('oauth-config')
  public oauthConfig(_req: Request, _res: Response) {
    rejectLegacyAuth();
  }

  @Post('verify-email')
  @CatchAsync
  public async verifyEmail(_req: Request, _res: Response, _next: NextFunction) {
    rejectLegacyAuth();
  }

  @Post('request-verification')
  @CatchAsync
  public async requestVerification(_req: Request, _res: Response, _next: NextFunction) {
    rejectLegacyAuth();
  }

  @Post('request-password-reset')
  @CatchAsync
  public async requestPasswordReset(_req: Request, _res: Response, _next: NextFunction) {
    rejectLegacyAuth();
  }

  @Post('reset-password')
  @CatchAsync
  public async resetPassword(_req: Request, _res: Response, _next: NextFunction) {
    rejectLegacyAuth();
  }
}
