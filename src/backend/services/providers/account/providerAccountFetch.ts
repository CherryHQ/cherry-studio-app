import { createFetchBridge, HttpError } from '@/backend/services/http';

const MAX_ACCOUNT_RESPONSE_BYTES = 1_048_576;

function requireAccountEndpoint(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.hash) return url;
  } catch {
    // Invalid destinations never enter either the Request constructor or the HTTP transport.
  }
  throw new HttpError('Provider account endpoint is invalid.', {
    code: 'INVALID_ACCOUNT_ENDPOINT',
    kind: 'internal',
  });
}

/** Fetch-shaped bridge for non-streaming account protocols; routes never own account credentials. */
export function createProviderAccountFetch(): typeof globalThis.fetch {
  return createFetchBridge({
    assertUrl: requireAccountEndpoint,
    unsupportedMethodError: () =>
      new HttpError('Provider account request method is unsupported.', {
        code: 'INVALID_ACCOUNT_METHOD',
        kind: 'internal',
      }),
    maxResponseBytes: MAX_ACCOUNT_RESPONSE_BYTES,
  });
}
