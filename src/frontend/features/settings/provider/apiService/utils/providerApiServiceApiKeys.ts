import * as Crypto from 'expo-crypto';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

export type ApiKeyValidationError = 'empty' | 'duplicate' | 'invalidFormat';

export const API_KEY_ERROR_LABELS = {
  empty: 'settings.provider.apiService.apiKeyRequired',
  duplicate: 'settings.provider.apiService.keys.duplicate',
  invalidFormat: 'settings.provider.apiService.keys.invalidFormat',
} as const satisfies Record<ApiKeyValidationError, string>;

export function createApiKeyEntry(): ApiKeyEntry {
  return { id: Crypto.randomUUID(), isEnabled: true, key: '' };
}

/** Keep short credentials fully hidden and expose only a small suffix for recognition. */
export function maskProviderApiKey(key: string): string {
  const trimmedKey = key.trim();
  return trimmedKey.length > 8 ? `•••• ${trimmedKey.slice(-4)}` : '••••••••';
}

export function getApiKeyValidationError(
  entry: ApiKeyEntry,
  entries: readonly ApiKeyEntry[],
): ApiKeyValidationError | undefined {
  const key = entry.key.trim();
  if (!key) return 'empty';
  if (/[\s,，]/.test(key)) return 'invalidFormat';
  if (entries.some((other) => other.id !== entry.id && other.key.trim() === key)) {
    return 'duplicate';
  }
  return undefined;
}

/** Normalize values without dropping entries or changing their identities. */
export function normalizeApiKeyEntries(apiKeys: readonly ApiKeyEntry[]): ApiKeyEntry[] {
  return apiKeys.map((entry) => ({
    ...entry,
    key: entry.key.trim(),
    ...(entry.label !== undefined ? { label: entry.label.trim() } : {}),
  }));
}

export function areApiKeyEntriesEqual(
  left: readonly ApiKeyEntry[],
  right: readonly ApiKeyEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        entry.id === other.id &&
        entry.key === other.key &&
        (entry.label ?? '') === (other.label ?? '') &&
        entry.isEnabled === other.isEnabled
      );
    })
  );
}
