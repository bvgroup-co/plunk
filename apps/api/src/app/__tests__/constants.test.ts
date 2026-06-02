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
    LANDING_URI: 'http://localhost:4000',
    WIKI_URI: 'http://localhost:1000',
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

  it('gates SES event SQS polling in SendGrid mode', async () => {
    const constants = await importConstants({
      EMAIL_PROVIDER: 'sendgrid',
      SENDGRID_API_KEY: 'sendgrid-key',
      SES_EVENTS_SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/queue',
    });

    expect(constants.SES_EVENTS_SQS_ENABLED).toBe(false);
  });
});
