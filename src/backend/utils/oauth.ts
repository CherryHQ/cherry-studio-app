import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

import { resolveNativeCallbackUrl } from '@/shared/utils/nativeCallbackUrl';

const base64Url = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 32 random bytes in unpadded base64url, for OAuth `state` and PKCE verifiers. */
export function randomOauthValue(): string {
  return base64Url(btoa(String.fromCharCode(...getRandomBytes(32))));
}

/** RFC 7636 S256 pair: a fresh verifier and its base64url SHA-256 challenge. */
export async function createPkceChallenge(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomOauthValue();
  const challenge = base64Url(
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: CryptoEncoding.BASE64,
    }),
  );
  return { verifier, challenge };
}

export function nativeCallbackUrl(path: string): string | undefined {
  return resolveNativeCallbackUrl(Constants.expoConfig?.scheme, path);
}
