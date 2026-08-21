import * as Crypto from 'expo-crypto';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

function createApiKeyEntryId(): string {
  return Crypto.randomUUID();
}

export function normalizeApiKeySingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, '');
}

export function buildApiKeysInputFromEntries(apiKeys: readonly ApiKeyEntry[]): string {
  return apiKeys.flatMap((entry) => entry.key.trim() || []).join(',');
}

export function buildApiKeyEntriesFromInput(
  input: string,
  currentEntries: readonly ApiKeyEntry[],
): ApiKeyEntry[] {
  const keys = [
    ...new Set(
      input
        .split(/[\n,]/)
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];

  return keys.map((key, index) => ({
    ...(currentEntries[index] ?? createEmptyApiKeyEntry()),
    key,
  }));
}

function createEmptyApiKeyEntry(): ApiKeyEntry {
  return {
    id: createApiKeyEntryId(),
    isEnabled: true,
    key: '',
  };
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
