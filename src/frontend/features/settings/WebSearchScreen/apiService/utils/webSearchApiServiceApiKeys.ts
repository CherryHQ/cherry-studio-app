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
