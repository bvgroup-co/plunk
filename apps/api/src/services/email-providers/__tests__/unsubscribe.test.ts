import {describe, expect, it} from 'vitest';

import {addListUnsubscribeHeader, getListUnsubscribeHeader} from '../unsubscribe.js';

describe('unsubscribe headers', () => {
  it('extracts unsubscribe links into List-Unsubscribe headers', () => {
    const header = getListUnsubscribeHeader('<a href="http://localhost:3000/unsubscribe/contact-id">unsubscribe</a>');

    expect(header).toBe('<http://localhost:3000/unsubscribe/contact-id>');
  });

  it('preserves custom headers while adding List-Unsubscribe', () => {
    const headers = addListUnsubscribeHeader(
      {
        'X-Custom': 'value',
      },
      '<a href="http://localhost:3000/unsubscribe/contact-id">unsubscribe</a>',
    );

    expect(headers).toEqual({
      'X-Custom': 'value',
      'List-Unsubscribe': '<http://localhost:3000/unsubscribe/contact-id>',
    });
  });
});
