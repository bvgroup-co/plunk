import { ChildControllers, Controller } from "@overnightjs/core";
import { IncomingWebhooks } from "./Incoming";
import { SendGridWebhooks } from "./SendGrid";

@Controller("webhooks")
@ChildControllers([new IncomingWebhooks(), new SendGridWebhooks()])
export class Webhooks {}
