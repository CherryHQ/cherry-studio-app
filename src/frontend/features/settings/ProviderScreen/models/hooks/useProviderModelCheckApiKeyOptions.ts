import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type ProviderModelCheckApiKeyOption,
  providerModelCheckDefaultApiKeyValue,
} from '../utils/providerModelCheckSelection';

/**
 * The keys a connectivity check can run with. Shared by the check section and
 * the screen that picks one, so the row's value and the list it comes from are
 * always the same list.
 */
export function useProviderModelCheckApiKeyOptions(
  apiKeys: readonly ApiKeyEntry[] | undefined,
): ProviderModelCheckApiKeyOption[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const options = (apiKeys ?? [])
      .filter((apiKey) => apiKey.isEnabled)
      .map((apiKey, index) => ({
        id: apiKey.id,
        key: apiKey.key,
        label:
          apiKey.label?.trim() ||
          t('settings.provider.models.checkApiKeyFallback', {
            index: index + 1,
            key: maskProviderModelCheckApiKey(apiKey.key),
          }),
        value: apiKey.id,
      }));

    return options.length > 0
      ? options
      : [
          {
            id: providerModelCheckDefaultApiKeyValue,
            label: t('settings.provider.models.checkDefaultApiKey'),
            value: providerModelCheckDefaultApiKeyValue,
          },
        ];
  }, [apiKeys, t]);
}

function maskProviderModelCheckApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
