import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';

import { apiKeyEntriesSignature, normalizeApiKeyEntries } from './providerApiServiceApiKeys';

export function getProviderApiServiceApiKeysDirtyState({
  apiKeys,
  entries,
}: {
  apiKeys: readonly ApiKeyEntry[];
  entries: readonly ApiKeyEntry[];
}): boolean {
  return (
    apiKeyEntriesSignature(entries) !== apiKeyEntriesSignature(normalizeApiKeyEntries(apiKeys))
  );
}
