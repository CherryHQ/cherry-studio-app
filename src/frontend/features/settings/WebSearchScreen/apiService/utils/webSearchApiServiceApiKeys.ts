export type WebSearchApiKeyEntry = {
  id: string;
  isNew: boolean;
  key: string;
};

function createApiKeyEntryId(): string {
  return `websearch-api-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeWebSearchApiKeys(apiKeys: readonly string[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const value of apiKeys) {
    const key = value.trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

export function parseWebSearchApiKeysInput(input: string): string[] {
  return normalizeWebSearchApiKeys(input.split(/[,\n]/));
}

export function buildWebSearchApiKeysInput(apiKeys: readonly string[]): string {
  return normalizeWebSearchApiKeys(apiKeys).join(',');
}

export function buildWebSearchApiKeyEntries(apiKeys: readonly string[]): WebSearchApiKeyEntry[] {
  return normalizeWebSearchApiKeys(apiKeys).map((key, index) => ({
    id: `websearch-key-${index}-${key}`,
    isNew: false,
    key,
  }));
}

export function createEmptyWebSearchApiKeyEntry(): WebSearchApiKeyEntry {
  return {
    id: createApiKeyEntryId(),
    isNew: true,
    key: '',
  };
}
