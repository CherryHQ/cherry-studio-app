import { readInternalHref } from '@/frontend/utils/internalHref';

const ACCOUNT_ROUTES = new Set(['/login', '/auth/callback']);

export function isAccountRoute(pathname: string): boolean {
  return ACCOUNT_ROUTES.has(pathname);
}

/** Login and one-use callback routes cannot be replayed as completion destinations. */
export function readAccountReturnTo(
  value: string | readonly string[] | undefined,
): string | undefined {
  const href = readInternalHref(value);
  if (!href) return undefined;
  const pathname = href.split('?')[0].replace(/\/+$/, '') || '/';
  return !isAccountRoute(pathname) && !/\/(?:oauth-)?callback$/.test(pathname) ? href : undefined;
}

export function accountSignInHref(returnTo: string, purpose?: 'expired') {
  return {
    pathname: '/login' as const,
    params: {
      returnTo: readAccountReturnTo(returnTo) ?? '/settings/profile',
      ...(purpose ? { purpose } : {}),
    },
  };
}

/** Keep query identity while avoiding a second copy of parameters already present in the path. */
export function accountSessionReturnTo(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
  segments: readonly string[],
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (segments.includes(`[${key}]`) || segments.includes(`[...${key}]`)) continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      search.append(key, item);
    }
  }
  const query = search.toString();
  return readAccountReturnTo(query ? `${pathname}?${query}` : pathname) ?? '/';
}
