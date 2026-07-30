import * as Crypto from 'expo-crypto';

import type { ApiKeyEntry } from '@/shared/domain/provider';

function createApiKeyEntryId(): string {
  return Crypto.randomUUID();
}

export function normalizeApiKeySingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, '');
}

export function buildApiKeysInputFromEntries(apiKeys: readonly ApiKeyEntry[]): string {
  return apiKeys.flatMap((entry) => entry.key.trim() || []).join(',');
}

export function cloneApiKeyEntries(apiKeys: readonly ApiKeyEntry[]): ApiKeyEntry[] {
  return apiKeys.map((entry) => ({ ...entry }));
}

export function createEmptyApiKeyEntry(): ApiKeyEntry {
  return {
    id: createApiKeyEntryId(),
    isEnabled: true,
    key: '',
  };
}

export function apiKeyEntriesSignature(apiKeys: readonly ApiKeyEntry[]): string {
  return JSON.stringify(
    apiKeys
      .flatMap((entry) => {
        const key = entry.key.trim();
        return key
          ? [{ id: entry.id, isEnabled: entry.isEnabled, key, label: entry.label ?? '' }]
          : [];
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

export function normalizeApiKeyEntries(apiKeys: readonly ApiKeyEntry[]): ApiKeyEntry[] {
  const seen = new Set<string>();
  const entries: ApiKeyEntry[] = [];

  for (const entry of apiKeys) {
    const key = entry.key.trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push({
      ...entry,
      key,
    });
  }

  return entries;
}
