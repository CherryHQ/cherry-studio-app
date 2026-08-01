import { useToast } from 'heroui-native/toast';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderOverride,
} from '@cherrystudio/universal/data/preference';
import { useWebSearchApiManagementContext } from '../../context/WebSearchApiManagementContext';
import {
  getWebSearchCapabilityTitleKey,
  getWebSearchProviderDescriptionKey,
  normalizeWebSearchApiHost,
  type WebSearchProviderDetailSection,
} from '../../utils/providerSettings';
import {
  buildWebSearchApiKeysInput,
  parseWebSearchApiKeysInput,
} from '../utils/webSearchApiServiceApiKeys';
import { WebSearchApiServiceApiKeysField } from './WebSearchApiServiceApiKeyFields';
import {
  type WebSearchApiServiceCheckApiKeyOption,
  WebSearchApiServiceCheckSheet,
} from './WebSearchApiServiceCheckSheet';
import { ConfigField, SettingTextInput } from './WebSearchApiServiceFieldPrimitives';

function ZhipuApiKeyShortcutSection() {
  const {
    actions: { openZhipuApiKeySettings },
    meta: { t },
  } = useWebSearchApiManagementContext();

  return (
    <Pressable
      accessibilityLabel={t('settings.websearch.provider.configureZhipuApiKey')}
      accessibilityRole="button"
      className="h-12 items-center justify-center rounded-xl bg-settings-grouped-surface active:opacity-60"
      hitSlop={6}
      onPress={openZhipuApiKeySettings}
    >
      <Text className="font-medium text-base text-foreground">
        {t('settings.websearch.provider.configureZhipuApiKey')}
      </Text>
    </Pressable>
  );
}

function DescriptionSection() {
  const {
    meta: { t },
    state: { provider },
  } = useWebSearchApiManagementContext();
  const descriptionKey = getWebSearchProviderDescriptionKey(provider.id);

  if (!descriptionKey) {
    return null;
  }

  return (
    <View className="rounded-2xl bg-settings-grouped-surface p-4">
      <Text className="text-base text-default-foreground">{t(descriptionKey)}</Text>
    </View>
  );
}

function ApiKeysSection() {
  const {
    actions: { checkProvider, onProviderOverrideChange, openApiKeySettings },
    meta: { t },
    state: { provider, providerOverride },
  } = useWebSearchApiManagementContext();
  const { toast } = useToast();
  const [apiKeysVisible, setApiKeysVisible] = useState(false);
  const [isCheckSheetOpen, setIsCheckSheetOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    status: 'error';
    message: string;
  } | null>(null);
  const [selectedCheckApiKeyId, setSelectedCheckApiKeyId] = useState<string | null>(null);
  const apiKeysInput = useMemo(
    () => buildWebSearchApiKeysInput(providerOverride?.apiKeys ?? []),
    [providerOverride?.apiKeys],
  );
  const checkApiKeyOptions = useMemo<WebSearchApiServiceCheckApiKeyOption[]>(
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

  const handleApiKeysCommit = useCallback(
    (nextValue: string) => {
      onProviderOverrideChange(provider.id, {
        apiKeys: parseWebSearchApiKeysInput(nextValue),
      });
    },
    [onProviderOverrideChange, provider.id],
  );

  const handleApiKeysVisibilityToggle = useCallback(() => {
    Keyboard.dismiss();
    setApiKeysVisible((visible) => !visible);
  }, []);
  const openCheckSheet = useCallback(() => {
    Keyboard.dismiss();
    setCheckResult(null);
    setSelectedCheckApiKeyId((current) =>
      checkApiKeyOptions.some((option) => option.value === current)
        ? current
        : (checkApiKeyOptions[0]?.value ?? null),
    );
    setIsCheckSheetOpen(true);
  }, [checkApiKeyOptions]);
  const closeCheckSheet = useCallback(() => {
    if (isChecking) {
      return;
    }
    setIsCheckSheetOpen(false);
  }, [isChecking]);
  const startCheck = useCallback(async () => {
    if (isChecking) {
      return;
    }

    const selectedApiKey =
      checkApiKeyOptions.find((option) => option.value === selectedCheckApiKeyId) ??
      checkApiKeyOptions[0];
    if (!selectedApiKey) {
      setCheckResult({
        status: 'error',
        message: t('settings.websearch.provider.checkNoApiKeys'),
      });
      return;
    }

    setIsChecking(true);
    setCheckResult(null);

    try {
      const result = await checkProvider(
        buildCheckProviderConfig(provider, providerOverride, selectedApiKey.key),
        resolveDefaultCheckCapability(provider),
      );

      if (result.valid) {
        setIsCheckSheetOpen(false);
        toast.show({
          label: t('settings.websearch.provider.checkSuccess'),
          variant: 'success',
        });
      } else {
        setCheckResult({
          status: 'error',
          message: result.error || t('settings.websearch.provider.checkFailed'),
        });
        toast.show({
          label: t('settings.websearch.provider.checkFailed'),
          variant: 'danger',
        });
      }
    } catch (error) {
      setCheckResult({
        status: 'error',
        message:
          error instanceof Error ? error.message : t('settings.websearch.provider.checkFailed'),
      });
      toast.show({
        label: t('settings.websearch.provider.checkFailed'),
        variant: 'danger',
      });
    }

    setIsChecking(false);
  }, [
    checkApiKeyOptions,
    checkProvider,
    isChecking,
    provider,
    providerOverride,
    selectedCheckApiKeyId,
    t,
    toast,
  ]);

  return (
    <>
      <WebSearchApiServiceApiKeysField
        apiKeysInput={apiKeysInput}
        apiKeysVisible={apiKeysVisible}
        onApiKeysInputChange={handleApiKeysCommit}
        onCheckPress={openCheckSheet}
        onManagePress={openApiKeySettings}
        onToggleVisible={handleApiKeysVisibilityToggle}
      />
      <WebSearchApiServiceCheckSheet
        apiKeyOptions={checkApiKeyOptions}
        checkResult={checkResult}
        isChecking={isChecking}
        isOpen={isCheckSheetOpen}
        selectedApiKeyId={selectedCheckApiKeyId}
        onApiKeyChange={setSelectedCheckApiKeyId}
        onClose={closeCheckSheet}
        onStart={startCheck}
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

function CapabilityApiHostSections() {
  const {
    actions: { onCapabilityApiHostChange },
    meta: { t },
    state: { provider, providerOverride },
  } = useWebSearchApiManagementContext();

  return (
    <>
      {provider.capabilities.map((capability) =>
        capability.apiHost !== undefined ? (
          <ConfigField
            key={capability.feature}
            label={t(getWebSearchCapabilityTitleKey(capability.feature))}
          >
            <SettingTextInput
              accessibilityLabel={t(getWebSearchCapabilityTitleKey(capability.feature))}
              onCommit={(nextValue) =>
                onCapabilityApiHostChange(
                  provider.id,
                  capability.feature,
                  normalizeWebSearchApiHost(nextValue),
                )
              }
              placeholder={capability.apiHost}
              value={
                providerOverride?.capabilities?.[capability.feature]?.apiHost ?? capability.apiHost
              }
            />
          </ConfigField>
        ) : null,
      )}
    </>
  );
}

function BasicAuthSection() {
  const {
    actions: { onProviderOverrideChange },
    meta: { t },
    state: { provider, providerOverride },
  } = useWebSearchApiManagementContext();

  const handleBasicAuthUsernameCommit = useCallback(
    (nextValue: string) => {
      const basicAuthUsername = nextValue.trim();

      onProviderOverrideChange(provider.id, {
        basicAuthUsername,
        basicAuthPassword: basicAuthUsername ? providerOverride?.basicAuthPassword : '',
      });
    },
    [onProviderOverrideChange, provider.id, providerOverride?.basicAuthPassword],
  );

  const handleBasicAuthPasswordCommit = useCallback(
    (nextValue: string) => {
      onProviderOverrideChange(provider.id, {
        basicAuthPassword: providerOverride?.basicAuthUsername ? nextValue.trim() : '',
      });
    },
    [onProviderOverrideChange, provider.id, providerOverride?.basicAuthUsername],
  );

  return (
    <View className="gap-4">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.websearch.provider.basicAuth')}
      </Text>
      <ConfigField label={t('settings.websearch.provider.basicAuthUsername')}>
        <SettingTextInput
          accessibilityLabel={t('settings.websearch.provider.basicAuthUsername')}
          onCommit={handleBasicAuthUsernameCommit}
          placeholder={t('settings.websearch.provider.basicAuthUsernamePlaceholder')}
          value={providerOverride?.basicAuthUsername ?? ''}
        />
      </ConfigField>
      {providerOverride?.basicAuthUsername ? (
        <ConfigField label={t('settings.websearch.provider.basicAuthPassword')}>
          <SettingTextInput
            accessibilityLabel={t('settings.websearch.provider.basicAuthPassword')}
            onCommit={handleBasicAuthPasswordCommit}
            placeholder={t('settings.websearch.provider.basicAuthPasswordPlaceholder')}
            secureTextEntry
            value={providerOverride?.basicAuthPassword ?? ''}
          />
        </ConfigField>
      ) : null}
    </View>
  );
}

export function WebSearchApiServiceFieldGroup({
  section,
}: {
  section: WebSearchProviderDetailSection;
}) {
  switch (section.type) {
    case 'apiKeys':
      return <ApiKeysSection />;
    case 'basicAuth':
      return <BasicAuthSection />;
    case 'capabilityApiHosts':
      return <CapabilityApiHostSections />;
    case 'description':
      return <DescriptionSection />;
    case 'zhipuApiKeyShortcut':
      return <ZhipuApiKeyShortcutSection />;
  }
}
