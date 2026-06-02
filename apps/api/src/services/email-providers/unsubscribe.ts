import {DASHBOARD_URI} from '../../app/constants.js';

export function getListUnsubscribeHeader(html: string): string | null {
  const unsubscribeMatch = /unsubscribe\/([^"?#/]+)(?:[?#][^"]*)?"/.exec(html);
  const unsubscribeId = unsubscribeMatch?.[1];

  return unsubscribeId ? `<${DASHBOARD_URI}/unsubscribe/${unsubscribeId}>` : null;
}

export function addListUnsubscribeHeader(headers: Record<string, string> | null | undefined, html: string) {
  const unsubscribeHeader = getListUnsubscribeHeader(html);
  if (!unsubscribeHeader) {
    return headers;
  }

  return {
    ...(headers ?? {}),
    'List-Unsubscribe': unsubscribeHeader,
  };
}
