import { randomUUID } from 'expo-crypto';

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

function modelReturnHref(destination: string, modelId: string, token: string) {
  const params = new URLSearchParams({ cloudModel: modelId, cloudReturn: token });
  return (
    destination + (destination.includes('?') ? '&' : '?') + params.toString().replaceAll('*', '%2A')
  );
}

/** Only a model row pressed on this install can resume a selection or send an answer. */
export function rememberCloudModelTap(destination: string, modelId: string): string {
  const href = modelReturnHref(destination, modelId, randomUUID());
  cacheService.setPersist('cloud.model_login_return', href);
  return href;
}

export function consumeCloudModelTap(
  destination: string,
  modelId: string,
  token?: string,
): boolean {
  if (!token) return false;
  return clearCloudModelTap(modelReturnHref(destination, modelId, token));
}

export function clearCloudModelTap(href: string): boolean {
  if (cacheService.getPersist('cloud.model_login_return') !== href) return false;
  cacheService.setPersist('cloud.model_login_return', null);
  return true;
}
