import Constants from 'expo-constants';
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

const NATIVE_SCHEMES = new Set(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview']);

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

/** `<scheme>://<path>` on this build's Cherry scheme; undefined outside native Cherry builds. */
export function nativeCallbackUrl(path: string): string | undefined {
  const configured = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configured) ? configured[0] : configured;
  return scheme && NATIVE_SCHEMES.has(scheme) ? `${scheme}://${path}` : undefined;
}
