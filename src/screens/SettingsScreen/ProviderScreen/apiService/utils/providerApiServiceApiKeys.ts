import type { ApiKeyEntry } from '@/data/types/provider';

function createApiKeyEntryId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `api-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
  return apiKeys
    .map((entry) => entry.key.trim())
    .filter(Boolean)
    .join(',');
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

export function serializeKeyValues(input: string): string {
  return JSON.stringify(parseApiKeysInput(input));
}

export function apiKeyEntriesSignature(apiKeys: readonly ApiKeyEntry[]): string {
  return JSON.stringify(
    apiKeys
      .map((entry) => ({
        id: entry.id,
        isEnabled: entry.isEnabled,
        key: entry.key.trim(),
        label: entry.label ?? '',
      }))
      .filter((entry) => entry.key)
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
