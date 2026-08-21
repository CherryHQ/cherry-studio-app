import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useMultiplePreferences } from '@/frontend/data/hooks';
import {
  getMobileSupportedWebSearchProvidersByCapability,
  type WebSearchProviderPreset,
} from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCompressionMethod,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@/shared/data/types/webSearch';

import type { SettingOption } from '../settingOptions';
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
  getMobileSupportedWebSearchProvidersByCapability('searchKeywords'),
);
const fetchUrlsProviderOptions = createWebSearchProviderOptions(
  getMobileSupportedWebSearchProvidersByCapability('fetchUrls'),
);

function createWebSearchProviderOptions(
  providers: readonly WebSearchProviderPreset[],
): SettingOption<WebSearchProviderId>[] {
  return providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  }));
}

export function useWebSearchProviderPreferences() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useMultiplePreferences(preferenceMapping);

  const compressionMethodOptions = useMemo<SettingOption<WebSearchCompressionMethod>[]>(
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
      onProviderOverrideChange: handleProviderOverrideChange,
    },
    searchKeywords: {
      options: searchKeywordsProviderOptions,
      value: preferences.defaultSearchKeywordsProvider,
      onValueChange: handleSearchKeywordsProviderChange,
    },
  };
}
