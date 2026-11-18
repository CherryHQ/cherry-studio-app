/** Credential configuration and pairing flows stay text-only, including their sheets.
 * Keep whole route families protected even when secret fields are currently masked.
 */
const SENSITIVE_ROUTE_PREFIXES = [
  '/settings/provider',
  '/settings/device-connections',
  '/plugins',
  '/oauth',
  '/uu-remote',
];

export function canCaptureFeedbackRoute(pathname: string): boolean {
  return !SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
