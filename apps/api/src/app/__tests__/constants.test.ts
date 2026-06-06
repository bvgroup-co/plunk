import {describe, expect, it, vi} from 'vitest';

async function importConstants(env: Record<string, string | undefined>) {
  vi.resetModules();

  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    JWT_SECRET: 'test',
    API_URI: 'http://localhost:8080',
    DASHBOARD_URI: 'http://localhost:3000',
    REDIS_URL: 'redis://localhost:6379',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/plunk_test',
    DIRECT_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/plunk_test',
    ...env,
  };

  try {
    return await import('../constants.js');
  } finally {
    process.env = originalEnv;
  }
}

describe('email provider env validation', () => {
  it('defaults to SES and requires SES credentials', async () => {
    const constants = await importConstants({
      AWS_SES_ACCESS_KEY_ID: 'key',
      AWS_SES_REGION: 'us-east-1',
      AWS_SES_SECRET_ACCESS_KEY: 'secret',
    });

    expect(constants.EMAIL_PROVIDER).toBe('ses');
    expect(constants.EMAIL_PROVIDER_IS_SES).toBe(true);
  });

  it('requires SendGrid API key only in SendGrid mode', async () => {
    const constants = await importConstants({
      AWS_SES_ACCESS_KEY_ID: undefined,
      AWS_SES_REGION: undefined,
      AWS_SES_SECRET_ACCESS_KEY: undefined,
      EMAIL_PROVIDER: 'sendgrid',
      SENDGRID_API_KEY: 'sendgrid-key',
    });

    expect(constants.EMAIL_PROVIDER).toBe('sendgrid');
    expect(constants.AWS_SES_REGION).toBe('');
  });

  it('requires Postal env without SES or SendGrid credentials in Postal mode', async () => {
    const constants = await importConstants({
      AWS_SES_ACCESS_KEY_ID: undefined,
      AWS_SES_REGION: undefined,
      AWS_SES_SECRET_ACCESS_KEY: undefined,
      EMAIL_PROVIDER: 'postal',
      POSTAL_BASE_URL: 'https://postal.example.com',
      POSTAL_API_KEY: 'postal-key',
      POSTAL_CNAME_VALUE: 'postal.example.com',
      SENDGRID_API_KEY: undefined,
    });

    expect(constants.EMAIL_PROVIDER).toBe('postal');
    expect(constants.EMAIL_PROVIDER_IS_POSTAL).toBe(true);
    expect(constants.AWS_SES_REGION).toBe('');
    expect(constants.SENDGRID_API_KEY).toBe('');
    expect(constants.POSTAL_WEBHOOK_SIGNATURE_REQUIRED).toBe(false);
  });

  it('defaults Postal webhook signature requirement when a secret is configured', async () => {
    const constants = await importConstants({
      EMAIL_PROVIDER: 'postal',
      POSTAL_BASE_URL: 'https://postal.example.com',
      POSTAL_API_KEY: 'postal-key',
      POSTAL_CNAME_VALUE: 'postal.example.com',
      POSTAL_WEBHOOK_SECRET: 'secret',
    });

    expect(constants.POSTAL_WEBHOOK_SIGNATURE_REQUIRED).toBe(true);
  });

  it('gates SES event SQS polling in SendGrid mode', async () => {
    const constants = await importConstants({
      EMAIL_PROVIDER: 'sendgrid',
      SENDGRID_API_KEY: 'sendgrid-key',
      SES_EVENTS_SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/queue',
    });

    expect(constants.SES_EVENTS_SQS_ENABLED).toBe(false);
  });
});
