# Email providers

Plunk supports AWS SES and SendGrid for outbound delivery.

## Selecting a provider

Set `EMAIL_PROVIDER` to `ses` or `sendgrid`. SES remains the default provider.

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxx
```

## SendGrid event webhooks

When `EMAIL_PROVIDER=sendgrid`, configure SendGrid Event Webhook delivery to:

```text
POST /webhooks/sendgrid/events
```

The route requires the raw JSON body for ECDSA signature verification. Configure these variables with the public key from
SendGrid's Event Webhook settings:

```env
SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY=
SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED=true
SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300
```

Processed SendGrid events are deduplicated by `sg_event_id` and correlated by `custom_args.plunk_email_id` first, then
`sg_message_id`. Delivery, open, click, bounce, complaint, unsubscribe, and dropped events update Plunk email analytics and
contact suppression state.

## SendGrid domain authentication

Domain onboarding uses SendGrid Domain Authentication when `EMAIL_PROVIDER=sendgrid`. Configure:

```env
SENDGRID_REGION=global
SENDGRID_DOMAIN_AUTH_SUBDOMAIN=mail
SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY=true
SENDGRID_DOMAIN_AUTH_DEFAULT=false
# SENDGRID_ON_BEHALF_OF=
```

The Domains screen displays the DNS records returned by SendGrid and validates them through SendGrid's domain validation
API. SES inbound processing and SNS/SQS event handling remain SES-only.
