import { Button, Section } from '@cherrystudio/ui/components';
import {
  WEB_SEARCH_PROVIDER_IDS,
  type WebSearchCapability,
  type WebSearchProvider,
  type WebSearchProviderId,
  type WebSearchProviderOverride,
} from '@cherrystudio/universal/data/preference';
import { isMobileSupportedWebSearchProviderId } from '@cherrystudio/universal/data/presets/webSearchProviders';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';
import { BackHeader } from '@/frontend/components/headers';
import {
  SingleSelectionSheet,
  type SingleSelectionSheetOption,
} from '@/frontend/components/selectionSheet';
import { useBackendModule } from '@/frontend/data';

import { useWebSearchProviderPreferences } from '../hooks/useWebSearchProviderPreferences';
import { getWebSearchProviderPreset } from './utils/providerSettings';

type WebSearchCheckApiKeyOption = SingleSelectionSheetOption<string> & {
  key: string;
};

function isWebSearchProviderId(value: string): value is WebSearchProviderId {
  return WEB_SEARCH_PROVIDER_IDS.includes(value as WebSearchProviderId);
}

export default function WebSearchCheckScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { showMessage } = useAppAlert();
  const webSearch = useBackendModule('webSearch');
  const webSearchProviders = useWebSearchProviderPreferences();
  const [isApiKeySheetOpen, setIsApiKeySheetOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const checkRunIdRef = useRef(0);
  const validProviderId =
    providerId &&
    isWebSearchProviderId(providerId) &&
    isMobileSupportedWebSearchProviderId(providerId)
      ? providerId
      : undefined;
  const provider = validProviderId ? getWebSearchProviderPreset(validProviderId) : undefined;
  const providerOverride = validProviderId
    ? webSearchProviders.providerOverrides.value[validProviderId]
    : undefined;
  const apiKeyOptions = useMemo<WebSearchCheckApiKeyOption[]>(
    () =>
      (providerOverride?.apiKeys ?? []).map((apiKey, index) => ({
        key: apiKey,
        label: t('settings.websearch.provider.checkApiKeyFallback', {
          index: index + 1,
          key: maskWebSearchApiKey(apiKey),
        }),
        value: `api-key-${index}`,
      })),
    [providerOverride?.apiKeys, t],
  );
  const selectedApiKey =
    apiKeyOptions.find((option) => option.value === selectedApiKeyId) ?? apiKeyOptions[0];

  useEffect(
    () => () => {
      checkRunIdRef.current += 1;
    },
    [],
  );

  if (!provider) {
    return <Redirect href="/settings/websearch" />;
  }

  const startCheck = async () => {
    if (isChecking) {
      return;
    }

    if (!selectedApiKey) {
      showMessage({
        description: t('settings.websearch.provider.checkNoApiKeys'),
        title: t('settings.websearch.provider.checkFailed'),
      });
      return;
    }

    setIsChecking(true);
    setSuccessMessage(null);
    const runId = checkRunIdRef.current + 1;
    checkRunIdRef.current = runId;

    try {
      const result = await webSearch.checkProvider({
        capability: resolveDefaultCheckCapability(provider),
        provider: buildCheckProviderConfig(provider, providerOverride, selectedApiKey.key),
      });

      if (checkRunIdRef.current !== runId) {
        return;
      }

      if (result.valid) {
        const message = t('settings.websearch.provider.checkSuccess');
        setSuccessMessage(message);
        toast.show({ label: message, variant: 'success' });
      } else {
        const message = result.error || t('settings.websearch.provider.checkFailed');
        showMessage({
          description: message,
          title: t('settings.websearch.provider.checkFailed'),
        });
      }
    } catch (error) {
      if (checkRunIdRef.current !== runId) {
        return;
      }
      const message =
        error instanceof Error ? error.message : t('settings.websearch.provider.checkFailed');
      showMessage({
        description: message,
        title: t('settings.websearch.provider.checkFailed'),
      });
    } finally {
      if (checkRunIdRef.current === runId) {
        setIsChecking(false);
      }
    }
  };

  return (
    <>
      <BackHeader title={t('settings.websearch.provider.checkTitle')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-5 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          <Section.Item
            disabled={isChecking || apiKeyOptions.length === 0}
            label={t('settings.websearch.provider.checkApiKeySection')}
            onPress={() => setIsApiKeySheetOpen(true)}
            trailing={
              <View className="min-w-0 max-w-56 flex-row items-center justify-end gap-1">
                <Text
                  className="min-w-0 shrink text-right text-base text-default-foreground"
                  numberOfLines={1}
                >
                  {selectedApiKey?.label ?? t('settings.websearch.provider.checkNoApiKeys')}
                </Text>
                <ChevronRightIcon
                  className="size-5 shrink-0 text-default-foreground"
                  strokeWidth={2}
                />
              </View>
            }
          />
        </Section>

        {successMessage ? (
          <View className="gap-1 rounded-xl bg-vbg-gray-100 px-4 py-3">
            <Text selectable className="text-base text-success">
              {successMessage}
            </Text>
          </View>
        ) : null}

        <Button disabled={!selectedApiKey} loading={isChecking} onPress={() => void startCheck()}>
          {isChecking
            ? t('settings.websearch.provider.checkChecking')
            : t('settings.websearch.provider.checkStart')}
        </Button>
      </ScrollView>

      <SingleSelectionSheet
        closeAccessibilityLabel={t('common.close')}
        emptyText={t('settings.websearch.provider.checkNoApiKeys')}
        heightFraction={0.6}
        isOpen={isApiKeySheetOpen}
        onClose={() => setIsApiKeySheetOpen(false)}
        onSelect={setSelectedApiKeyId}
        options={apiKeyOptions}
        selectedValue={selectedApiKey?.value ?? null}
        testID="websearch-api-key-selection"
        title={t('settings.websearch.provider.checkApiKeySection')}
      />
    </>
  );
}

function buildCheckProviderConfig(
  provider: {
    id: WebSearchProvider['id'];
    name: string;
    type: WebSearchProvider['type'];
    capabilities: readonly WebSearchProvider['capabilities'][number][];
  },
  override: WebSearchProviderOverride | undefined,
  selectedApiKey: string,
): WebSearchProvider {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    apiKeys: [selectedApiKey],
    capabilities: provider.capabilities.map((capability) => {
      const apiHostOverride = override?.capabilities?.[capability.feature]?.apiHost;

      if (capability.apiHost === undefined || apiHostOverride === undefined) {
        return capability;
      }

      return {
        ...capability,
        apiHost: apiHostOverride.trim(),
      };
    }),
    engines: override?.engines?.flatMap((engine) => engine.trim() || []) ?? [],
    basicAuthUsername: override?.basicAuthUsername?.trim() ?? '',
    basicAuthPassword: override?.basicAuthPassword?.trim() ?? '',
  };
}

function resolveDefaultCheckCapability(provider: {
  capabilities: readonly WebSearchProvider['capabilities'][number][];
}): WebSearchCapability {
  return provider.capabilities.some((capability) => capability.feature === 'searchKeywords')
    ? 'searchKeywords'
    : 'fetchUrls';
}

function maskWebSearchApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
