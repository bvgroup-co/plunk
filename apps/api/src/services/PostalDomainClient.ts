import {
  POSTAL_API_KEY,
  POSTAL_DOMAIN_API_BASE_URL,
  POSTAL_DOMAIN_API_KEY,
  POSTAL_DOMAIN_SERVER_ID,
  POSTAL_DOMAIN_SERVER_PERMALINK,
} from '../app/constants.js';
import {HttpException} from '../exceptions/index.js';

type PostalDnsRecordType = 'TXT' | 'CNAME' | 'MX';
type PostalDnsRecordPurpose = 'ownership-verification' | 'spf' | 'dkim' | 'return-path' | 'inbound-mx' | 'tracking';
type PostalDnsRecordStatus = 'OK' | 'Missing' | 'Invalid' | 'Pending' | null;

export type PostalDnsRecord = {
  type: PostalDnsRecordType;
  host: string;
  value: string;
  priority?: number;
  required?: boolean;
  purpose?: PostalDnsRecordPurpose;
  status?: PostalDnsRecordStatus;
  error?: string | null;
};

export type PostalDomainResponse = {
  id: string;
  uuid?: string;
  name: string;
  verified: boolean;
  records: PostalDnsRecord[];
  statuses?: PostalJsonObject;
  raw: PostalJsonObject;
};

export type PostalJsonValue = string | number | boolean | null | PostalJsonObject | PostalJsonValue[];
export type PostalJsonObject = {[key: string]: PostalJsonValue};

type PostalDomainRecordInput = Record<string, unknown>;
type PostalDomainInput = Record<string, unknown>;

const DNS_RECORD_TYPES = ['TXT', 'CNAME', 'MX'] as const;
const POSTAL_RECORD_STATUSES = ['OK', 'Missing', 'Invalid', 'Pending'] as const;
const POSTAL_RECORD_PURPOSES = [
  'ownership-verification',
  'spf',
  'dkim',
  'return-path',
  'inbound-mx',
  'tracking',
] as const;

function getPostalDomainBaseUrl(): string {
  if (!POSTAL_DOMAIN_API_BASE_URL) {
    throw new HttpException(503, 'Postal domain management is not configured');
  }

  return POSTAL_DOMAIN_API_BASE_URL.replace(/\/$/, '');
}

function getPostalDomainApiKey(): string {
  const apiKey = POSTAL_DOMAIN_API_KEY || POSTAL_API_KEY;
  if (!apiKey) {
    throw new HttpException(503, 'Postal domain management API key is not configured');
  }

  return apiKey;
}

function isRecordType(value: string): value is PostalDnsRecordType {
  return DNS_RECORD_TYPES.includes(value as PostalDnsRecordType);
}

function normalizeRecordType(value: unknown): PostalDnsRecordType {
  if (typeof value !== 'string') {
    throw new HttpException(502, 'Postal domain record is missing a DNS record type');
  }

  const recordType = value.toUpperCase();
  if (!isRecordType(recordType)) {
    throw new HttpException(502, `Postal domain record type ${recordType} is not supported`);
  }

  return recordType;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function normalizeRequiredString(value: unknown, field: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new HttpException(502, `Postal domain record is missing ${field}`);
  }

  return normalized;
}

function normalizePriority(value: unknown): number | undefined {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

  const priority = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(priority)) {
    throw new HttpException(502, 'Postal MX record priority must be an integer');
  }

  return priority;
}

function normalizeRequired(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizePurpose(value: unknown): PostalDnsRecordPurpose | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return POSTAL_RECORD_PURPOSES.includes(value as PostalDnsRecordPurpose)
    ? (value as PostalDnsRecordPurpose)
    : undefined;
}

function normalizeStatus(value: unknown): PostalDnsRecordStatus | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return POSTAL_RECORD_STATUSES.includes(value as NonNullable<PostalDnsRecordStatus>)
    ? (value as NonNullable<PostalDnsRecordStatus>)
    : undefined;
}

function normalizeError(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return normalizeOptionalString(value);
}

function toPostalJsonValue(value: unknown): PostalJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toPostalJsonValue);
  }

  if (typeof value === 'object') {
    return toPostalJsonObject(value as Record<string, unknown>);
  }

  return null;
}

function toPostalJsonObject(value: Record<string, unknown>): PostalJsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toPostalJsonValue(entry)]));
}

function normalizePostalRecord(record: PostalDomainRecordInput): PostalDnsRecord {
  const type = normalizeRecordType(record.type);
  const host = normalizeRequiredString(record.host ?? record.name, 'host');
  const value = normalizeRequiredString(record.value ?? record.data, 'value');
  const priority = normalizePriority(record.priority);
  const required = normalizeRequired(record.required);
  const purpose = normalizePurpose(record.purpose);
  const status = normalizeStatus(record.status);
  const error = normalizeError(record.error);

  return {
    type,
    host,
    value,
    ...(priority !== undefined ? {priority} : {}),
    ...(required !== undefined ? {required} : {}),
    ...(purpose !== undefined ? {purpose} : {}),
    ...(status !== undefined ? {status} : {}),
    ...(error !== undefined ? {error} : {}),
  };
}

function getRecordInputs(response: PostalDomainInput): PostalDomainRecordInput[] {
  const records = response.records ?? response.dns_records ?? response.dns;
  if (!Array.isArray(records)) {
    throw new HttpException(502, 'Postal domain response did not include DNS records');
  }

  return records.map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new HttpException(502, 'Postal domain response included an invalid DNS record');
    }

    return record as PostalDomainRecordInput;
  });
}

function normalizeVerified(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'verified' || value.toLowerCase() === 'success';
  }

  return false;
}

function normalizePostalDomainResponse(raw: unknown): PostalDomainResponse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpException(502, 'Postal domain response was not an object');
  }

  const response = raw as PostalDomainInput;
  const id =
    normalizeOptionalString(response.id) ?? normalizeOptionalString(response.uuid) ?? normalizeOptionalString(response.name);
  if (!id) {
    throw new HttpException(502, 'Postal domain response did not include a domain identifier');
  }

  const name = normalizeOptionalString(response.name) ?? normalizeOptionalString(response.domain);
  if (!name) {
    throw new HttpException(502, 'Postal domain response did not include a domain name');
  }

  return {
    id,
    ...(normalizeOptionalString(response.uuid) ? {uuid: normalizeOptionalString(response.uuid)} : {}),
    name,
    verified: normalizeVerified(response.verified ?? response.status),
    records: getRecordInputs(response).map(normalizePostalRecord),
    ...(response.statuses && typeof response.statuses === 'object' && !Array.isArray(response.statuses)
      ? {statuses: toPostalJsonObject(response.statuses as Record<string, unknown>)}
      : {}),
    raw: toPostalJsonObject(response),
  };
}

async function parsePostalDomainJson(response: Response): Promise<PostalDomainResponse> {
  return normalizePostalDomainResponse(await response.json());
}

async function postalDomainRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Server-API-Key', getPostalDomainApiKey());
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${getPostalDomainBaseUrl()}${path}`, {...init, headers});
  if (!response.ok) {
    const body = await response.text();
    throw new HttpException(response.status, body || 'Postal domain management request failed');
  }

  return response;
}

function getPostalServerPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  if (POSTAL_DOMAIN_SERVER_ID) {
    payload.server_id = POSTAL_DOMAIN_SERVER_ID;
  }
  if (POSTAL_DOMAIN_SERVER_PERMALINK) {
    payload.server_permalink = POSTAL_DOMAIN_SERVER_PERMALINK;
  }

  return {
    ...payload,
  };
}

export async function createPostalDomain(domain: string): Promise<PostalDomainResponse> {
  const response = await postalDomainRequest('/api/v1/domains', {
    method: 'POST',
    body: JSON.stringify({domain, ...getPostalServerPayload()}),
  });

  return parsePostalDomainJson(response);
}

export async function checkPostalDomain(domainId: string): Promise<PostalDomainResponse> {
  const response = await postalDomainRequest(`/api/v1/domains/${encodeURIComponent(domainId)}/check`, {
    method: 'POST',
  });

  return parsePostalDomainJson(response);
}

export async function deletePostalDomain(domainId: string): Promise<void> {
  await postalDomainRequest(`/api/v1/domains/${encodeURIComponent(domainId)}`, {method: 'DELETE'});
}
