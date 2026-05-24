import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useMultiplePreferences } from '@/data/hooks';
import type {
  WebSearchCapability,
  WebSearchCompressionMethod,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@/data/preference';
import {
  getWebSearchProvidersByCapability,
  type WebSearchProviderPreset,
} from '@/data/presets/webSearchProviders';
import type { SettingSelectOption } from '../components/SettingSelect';
import { mergeWebSearchProviderOverride } from '../WebSearchScreen/utils/providerSettings';

const preferenceMapping = {
  compressionCutoffLimit: 'chat.web_search.compression.cutoff_limit',
  compressionMethod: 'chat.web_search.compression.method',
  defaultFetchUrlsProvider: 'chat.web_search.default_fetch_urls_provider',
  defaultSearchKeywordsProvider: 'chat.web_search.default_search_keywords_provider',
  maxResults: 'chat.web_search.max_results',
  providerOverrides: 'chat.web_search.provider_overrides',
} as const;

const searchKeywordsProviderOptions = createWebSearchProviderOptions(
  getWebSearchProvidersByCapability('searchKeywords').filter((provider) => provider.type === 'api'),
);

const fetchUrlsProviderOptions = createWebSearchProviderOptions(
  getWebSearchProvidersByCapability('fetchUrls').filter((provider) => provider.type === 'api'),
);

function createWebSearchProviderOptions(
  providers: readonly WebSearchProviderPreset[],
): SettingSelectOption<WebSearchProviderId>[] {
  return providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  }));
}

export function useWebSearchProviderPreferences() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useMultiplePreferences(preferenceMapping);

  const compressionMethodOptions = useMemo<SettingSelectOption<WebSearchCompressionMethod>[]>(
    () => [
      { label: t('settings.websearch.compression.method.none'), value: 'none' },
      { label: t('settings.websearch.compression.method.cutoff'), value: 'cutoff' },
    ],
    [t],
  );

  const handleSearchKeywordsProviderChange = useCallback(
    (providerId: WebSearchProviderId) => {
      void setPreferences({ defaultSearchKeywordsProvider: providerId });
    },
    [setPreferences],
  );

  const handleFetchUrlsProviderChange = useCallback(
    (providerId: WebSearchProviderId) => {
      void setPreferences({ defaultFetchUrlsProvider: providerId });
    },
    [setPreferences],
  );

  const handleMaxResultsChange = useCallback(
    (maxResults: number) => {
      void setPreferences({ maxResults });
    },
    [setPreferences],
  );

  const handleCompressionMethodChange = useCallback(
    (compressionMethod: WebSearchCompressionMethod) => {
      void setPreferences({ compressionMethod });
    },
    [setPreferences],
  );

  const handleCompressionCutoffLimitChange = useCallback(
    (compressionCutoffLimit: number) => {
      void setPreferences({ compressionCutoffLimit });
    },
    [setPreferences],
  );

  const handleProviderOverrideChange = useCallback(
    (providerId: WebSearchProviderId, patch: WebSearchProviderOverride) => {
      void setPreferences({
        providerOverrides: mergeWebSearchProviderOverride(
          preferences.providerOverrides,
          providerId,
          patch,
        ),
      });
    },
    [preferences.providerOverrides, setPreferences],
  );

  const handleCapabilityApiHostChange = useCallback(
    (providerId: WebSearchProviderId, capability: WebSearchCapability, apiHost: string) => {
      handleProviderOverrideChange(providerId, {
        capabilities: {
          [capability]: { apiHost },
        },
      });
    },
    [handleProviderOverrideChange],
  );

  return {
    compressionCutoffLimit: {
      value: preferences.compressionCutoffLimit,
      onValueChange: handleCompressionCutoffLimitChange,
    },
    compressionMethod: {
      options: compressionMethodOptions,
      value: preferences.compressionMethod,
      onValueChange: handleCompressionMethodChange,
    },
    fetchUrls: {
      options: fetchUrlsProviderOptions,
      value: preferences.defaultFetchUrlsProvider,
      onValueChange: handleFetchUrlsProviderChange,
    },
    maxResults: {
      value: preferences.maxResults,
      onValueChange: handleMaxResultsChange,
    },
    providerOverrides: {
      value: preferences.providerOverrides,
      onCapabilityApiHostChange: handleCapabilityApiHostChange,
      onProviderOverrideChange: handleProviderOverrideChange,
    },
    searchKeywords: {
      options: searchKeywordsProviderOptions,
      value: preferences.defaultSearchKeywordsProvider,
      onValueChange: handleSearchKeywordsProviderChange,
    },
  };
}
