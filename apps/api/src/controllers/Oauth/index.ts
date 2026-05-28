import {ChildControllers, Controller} from '@overnightjs/core';

import {AUTH_MODE} from '../../app/constants.js';

import {Github} from './Github.js';
import {Google} from './Google.js';
import {Oidc} from './Oidc.js';

const childControllers = AUTH_MODE === 'oidc' ? [new Oidc()] : AUTH_MODE === 'oauth' ? [new Google(), new Github()] : [];

@Controller('oauth')
@ChildControllers(childControllers)
export class Oauth {}
