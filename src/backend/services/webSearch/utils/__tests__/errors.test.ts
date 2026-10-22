import { WebSearchError } from '@cherrystudio/web-search';

import { toWebSearchFailure } from '../errors';

test('retains upstream error codes and HTTP status in the existing failure envelope', () => {
  const error = new WebSearchError({
    providerId: 'jina',
    capability: 'fetchUrls',
    kind: 'http',
    code: 'http_error',
    status: 429,
    providerCode: 'RATE_LIMIT',
    message: 'Quota exceeded',
  });
  expect(toWebSearchFailure('https://example.com', error)).toEqual({
    input: 'https://example.com',
    kind: 'http',
    code: 'RATE_LIMIT',
    status: 429,
    message: 'Quota exceeded',
  });
});

test.each(['configuration', 'provider', 'network', 'timeout', 'invalid_response'] as const)(
  'keeps structured %s failures instead of degrading them to unknown',
  (kind) => {
    const error = new WebSearchError({
      providerId: 'exa-mcp',
      capability: 'searchKeywords',
      kind,
      code: 'failure',
      message: 'Failed',
    });
    expect(toWebSearchFailure('query', error)).toMatchObject({ kind, code: 'failure' });
  },
);
