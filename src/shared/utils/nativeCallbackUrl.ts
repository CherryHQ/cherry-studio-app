const NATIVE_SCHEMES = new Set(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview']);

/** `<scheme>://<path>` on this build's Cherry scheme; undefined outside native Cherry builds. */
export function resolveNativeCallbackUrl(
  configured: string | readonly string[] | undefined,
  path: string,
): string | undefined {
  const scheme = typeof configured === 'string' ? configured : configured?.[0];
  return scheme && NATIVE_SCHEMES.has(scheme) ? `${scheme}://${path}` : undefined;
}
