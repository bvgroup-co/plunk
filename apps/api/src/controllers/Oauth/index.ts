import {ChildControllers, Controller} from '@overnightjs/core';

import {Oidc} from './Oidc.js';

@Controller('oauth')
@ChildControllers([new Oidc()])
export class Oauth {}
