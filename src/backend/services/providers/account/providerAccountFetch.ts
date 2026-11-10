import { createFetchBridge, HttpError } from '@/backend/services/http';

import { ProviderOauthErrorSchema } from './providerOauth';

const MAX_ACCOUNT_RESPONSE_BYTES = 1_048_576;
const CREDENTIAL_EXCHANGE_PATHS = new Set([
  '/oauth/token',
  '/oauth2/token',
  '/api/oauth/token',
  '/copilot_internal/v2/token',
]);

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
  const fetchAccount = createFetchBridge({
    assertUrl: requireAccountEndpoint,
    unsupportedMethodError: () =>
      new HttpError('Provider account request method is unsupported.', {
        code: 'INVALID_ACCOUNT_METHOD',
        kind: 'internal',
      }),
    maxResponseBytes: MAX_ACCOUNT_RESPONSE_BYTES,
  });
  return async (input, init) => {
    const response = await fetchAccount(input, init);
    if (response.ok || response.status === 429 || response.status >= 500) return response;
    const failure = ProviderOauthErrorSchema.safeParse(
      await response
        .clone()
        .json()
        .catch(() => undefined),
    );
    // Only credential exchanges can reject the stored renewal grant. Copilot /models
    // uses a newly issued access token, so its failure must not invalidate the GitHub grant.
    const url = new URL(input instanceof Request ? input.url : String(input));
    const isConfigurationFailure = failure.success && failure.data.error !== 'invalid_grant';
    if (!isConfigurationFailure && !CREDENTIAL_EXCHANGE_PATHS.has(url.pathname)) return response;
    // Preserve confirmed rejections before SDKs replace their structured fields with error text.
    // Pending/slow-down responses still belong to the SDK's device-code polling loop.
    if (failure.success || response.status === 401) {
      throw new HttpError('Provider authorization rejected.', {
        kind: 'http',
        status: response.status,
        code: failure.success ? failure.data.error : undefined,
      });
    }
    return response;
  };
}
