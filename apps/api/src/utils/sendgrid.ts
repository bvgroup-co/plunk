import {SENDGRID_API_KEY, SENDGRID_ON_BEHALF_OF, SENDGRID_REGION} from '../app/constants.js';
import {HttpException} from '../exceptions/index.js';

const SENDGRID_BASE_URLS = {
  global: 'https://api.sendgrid.com',
  eu: 'https://api.eu.sendgrid.com',
} as const;

function getSendGridBaseUrl(): string {
  const testBaseUrl = process.env.SENDGRID_API_BASE_URL;
  if (testBaseUrl) {
    return testBaseUrl.replace(/\/$/, '');
  }

  return SENDGRID_BASE_URLS[SENDGRID_REGION];
}

export async function sendGridRequest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!SENDGRID_API_KEY) {
    throw new HttpException(503, 'SendGrid is not configured');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${SENDGRID_API_KEY}`);
  headers.set('Content-Type', 'application/json');

  if (SENDGRID_ON_BEHALF_OF) {
    headers.set('On-Behalf-Of', SENDGRID_ON_BEHALF_OF);
  }

  const response = await fetch(`${getSendGridBaseUrl()}${path}`, {...init, headers});

  if (!response.ok) {
    const body = await response.text();
    throw new HttpException(response.status, body || 'SendGrid request failed');
  }

  return response;
}
