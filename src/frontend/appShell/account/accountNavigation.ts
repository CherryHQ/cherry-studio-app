import { cacheService } from '@/frontend/data/CacheService';

import { readAccountReturnTo } from './accountRoute';

/** Profile-scoped, non-secret intent survives a cold auth callback, without crossing data spaces. */
export function rememberAccountReturnTo(returnTo: string): void {
  cacheService.setPersist('account.sign_in.return_to', readAccountReturnTo(returnTo) ?? null);
}

export function getAccountReturnTo(fallback: string): string {
  return (
    readAccountReturnTo(cacheService.getPersist('account.sign_in.return_to') ?? undefined) ??
    fallback
  );
}
