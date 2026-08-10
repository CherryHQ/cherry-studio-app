import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync, randomUUID } from 'expo-crypto';

import { OAuthServiceError } from '@/shared/oauth';

function normalizeRedirectPath(url: URL): string {
  return `${url.host}${url.pathname}`.replace(/^\/+|\/+$/g, '');
}

export function validateRedirectUri(
  redirectUri: string,
  expected: { path: string; scheme: string },
): string {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new OAuthServiceError('OAuth redirect URI is invalid', undefined, 'InvalidRedirectUri');
  }

  if (
    parsed.protocol !== `${expected.scheme}:` ||
    parsed.username ||
    parsed.password ||
    normalizeRedirectPath(parsed) !== expected.path.replace(/^\/+|\/+$/g, '')
  ) {
    throw new OAuthServiceError(
      `OAuth redirect URI is not allowed: ${redirectUri}`,
      undefined,
      'InvalidRedirectUri',
    );
  }
  return redirectUri;
}

export function parseAuthorizationCallback(
  callbackUrl: string,
  redirectUri: string,
  expectedState: string,
): string {
  let callback: URL;
  let redirect: URL;
  try {
    callback = new URL(callbackUrl);
    redirect = new URL(redirectUri);
  } catch {
    throw new OAuthServiceError('OAuth callback URL is invalid', undefined, 'InvalidOAuthCallback');
  }

  if (
    callback.protocol !== redirect.protocol ||
    callback.host !== redirect.host ||
    callback.username !== redirect.username ||
    callback.password !== redirect.password ||
    callback.pathname !== redirect.pathname
  ) {
    throw new OAuthServiceError(
      'OAuth callback does not match its redirect URI',
      undefined,
      'InvalidOAuthCallback',
    );
  }
  if (callback.searchParams.get('state') !== expectedState) {
    throw new OAuthServiceError('OAuth state does not match', undefined, 'InvalidOAuthState');
  }

  const providerError = callback.searchParams.get('error');
  if (providerError) {
    throw new OAuthServiceError(
      callback.searchParams.get('error_description') ?? providerError,
      undefined,
      'OAuthAuthorizationDenied',
    );
  }
  const code = callback.searchParams.get('code');
  if (!code) {
    throw new OAuthServiceError(
      'OAuth callback did not contain an authorization code',
      undefined,
      'MissingAuthorizationCode',
    );
  }
  return code;
}

export async function createPkceAuthorization(): Promise<{
  codeChallenge: string;
  codeVerifier: string;
  state: string;
}> {
  const codeVerifier = `${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
  const codeChallenge = (
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, codeVerifier, {
      encoding: CryptoEncoding.BASE64,
    })
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

  return { codeChallenge, codeVerifier, state: randomUUID() };
}
