import * as Crypto from 'expo-crypto';

import type { ApiKeyEntry } from '@/data/types/provider';

function createApiKeyEntryId(): string {
  return Crypto.randomUUID();
}

export function formatApiKeysInput(apiKeys: readonly ApiKeyEntry[]): string {
  return buildApiKeysInputFromEntries(apiKeys);
}

export function parseApiKeysInput(input: string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const item of input.split(/[,\n]/)) {
    const key = item.trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

export function buildApiKeyEntriesFromInput(
  input: string,
  existingKeys: readonly ApiKeyEntry[],
): ApiKeyEntry[] {
  const existingByKey = new Map(existingKeys.map((entry) => [entry.key.trim(), entry]));

  return parseApiKeysInput(input).map((key) => {
    const existing = existingByKey.get(key);

    if (existing) {
      return existing;
    }

    return {
      id: createApiKeyEntryId(),
      isEnabled: true,
      key,
    };
  });
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
