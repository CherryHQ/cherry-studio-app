export function isProviderOauthNavigationAllowed(
  url: string,
  allowedOrigins: readonly string[],
): boolean {
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}
