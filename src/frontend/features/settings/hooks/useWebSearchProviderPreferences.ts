import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMultiplePreferences } from '@/frontend/data/hooks';
import type {
  WebSearchCapability,
  WebSearchCompressionMethod,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@cherrystudio/universal/data/preference';
import {
  getMobileSupportedWebSearchProvidersByCapability,
  type WebSearchProviderPreset,
} from '@cherrystudio/universal/data/presets/webSearchProviders';
import type { SettingSelectOption } from '../components/SettingSelect';
import { mergeWebSearchProviderOverride } from '../WebSearchScreen/utils/providerSettings';

const preferenceMapping = {
  compressionCutoffLimit: 'chat.web_search.compression.cutoff_limit',
  compressionMethod: 'chat.web_search.compression.method',
  defaultSearchKeywordsProvider: 'chat.web_search.default_search_keywords_provider',
  maxResults: 'chat.web_search.max_results',
  providerOverrides: 'chat.web_search.provider_overrides',
} as const;

const searchKeywordsProviderOptions = createWebSearchProviderOptions(
  getMobileSupportedWebSearchProvidersByCapability('searchKeywords').filter(
    (provider) => provider.type === 'api',
  ),
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
    (providerId: WebSearchProviderId | null) => {
      void setPreferences({ defaultSearchKeywordsProvider: providerId });
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
