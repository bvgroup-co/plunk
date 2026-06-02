/**
 * Safely parse environment variables
 * @param key The key
 * @param defaultValue An optional default value if the environment variable does not exist
 */
export function validateEnv<T extends string = string>(key: keyof NodeJS.ProcessEnv, defaultValue?: T): T {
	const value = process.env[key] as T | undefined;

	if (!value) {
		if (typeof defaultValue !== "undefined") {
			return defaultValue;
		}
		throw new Error(`${key} is not defined in environment variables`);
	}

	return value;
}

// ENV
export const JWT_SECRET = validateEnv("JWT_SECRET");
export const NODE_ENV = validateEnv<"development" | "production">("NODE_ENV", "production");

export const REDIS_URL = validateEnv("REDIS_URL");
export const DISABLE_SIGNUPS = validateEnv("DISABLE_SIGNUPS", "false").toLowerCase() === "true";

// URLs
export const API_URI = validateEnv("API_URI", "http://localhost:4000");
export const APP_URI = validateEnv("APP_URI", "http://localhost:3000");

if (!API_URI.startsWith("http")) {
	throw new Error("API_URI must start with 'http'");
}

if (!APP_URI.startsWith("http")) {
	throw new Error("APP_URI must start with 'http'");
}

// Email providers
export const EMAIL_PROVIDERS = ["ses", "sendgrid"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
export const EMAIL_PROVIDER = validateEnv<EmailProvider>("EMAIL_PROVIDER", "ses");

if (!EMAIL_PROVIDERS.includes(EMAIL_PROVIDER)) {
	throw new Error("EMAIL_PROVIDER must be one of: ses, sendgrid");
}

export const EMAIL_PROVIDER_IS_SES = EMAIL_PROVIDER === "ses";
export const EMAIL_PROVIDER_IS_SENDGRID = EMAIL_PROVIDER === "sendgrid";

// AWS SES
export const AWS_REGION = validateEnv("AWS_REGION", "");
export const AWS_ACCESS_KEY_ID = validateEnv("AWS_ACCESS_KEY_ID", "");
export const AWS_SECRET_ACCESS_KEY = validateEnv("AWS_SECRET_ACCESS_KEY", "");
export const AWS_SES_CONFIGURATION_SET = validateEnv("AWS_SES_CONFIGURATION_SET", "");

// SendGrid
export const SENDGRID_API_KEY = validateEnv("SENDGRID_API_KEY", "");
export const SENDGRID_REGION = validateEnv<"global" | "eu">("SENDGRID_REGION", "global");
export const SENDGRID_DOMAIN_AUTH_SUBDOMAIN = validateEnv("SENDGRID_DOMAIN_AUTH_SUBDOMAIN", "mail");
export const SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY =
	validateEnv("SENDGRID_DOMAIN_AUTH_AUTOMATIC_SECURITY", "true").toLowerCase() === "true";
export const SENDGRID_DOMAIN_AUTH_DEFAULT =
	validateEnv("SENDGRID_DOMAIN_AUTH_DEFAULT", "false").toLowerCase() === "true";
export const SENDGRID_ON_BEHALF_OF = validateEnv("SENDGRID_ON_BEHALF_OF", "");
export const SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY = validateEnv("SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY", "");
export const SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED =
	validateEnv("SENDGRID_EVENT_WEBHOOK_SIGNATURE_REQUIRED", "true").toLowerCase() === "true";
export const SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = Number.parseInt(
	validateEnv("SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS", "300"),
	10,
);

if (
	EMAIL_PROVIDER_IS_SES &&
	(!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_SES_CONFIGURATION_SET)
) {
	throw new Error("AWS SES env vars are required when EMAIL_PROVIDER=ses");
}

if (EMAIL_PROVIDER_IS_SENDGRID && !SENDGRID_API_KEY) {
	throw new Error("SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid");
}

if (SENDGRID_REGION !== "global" && SENDGRID_REGION !== "eu") {
	throw new Error("SENDGRID_REGION must be either 'global' or 'eu'");
}

if (!Number.isInteger(SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS)) {
	throw new Error("SENDGRID_EVENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS must be an integer");
}
