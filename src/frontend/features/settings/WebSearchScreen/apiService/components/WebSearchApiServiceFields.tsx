import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';

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
      className="h-12 items-center justify-center rounded-xl bg-secondary active:opacity-60"
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
    <View className="rounded-2xl bg-grouped-surface p-4">
      <Text className="text-base text-default-foreground">{t(descriptionKey)}</Text>
    </View>
  );
}

function ApiKeysSection() {
  const {
    actions: { onProviderOverrideChange, openApiKeySettings },
    state: { provider, providerOverride },
  } = useWebSearchApiManagementContext();
  const [apiKeysVisible, setApiKeysVisible] = useState(false);
  const apiKeysInput = useMemo(
    () => buildWebSearchApiKeysInput(providerOverride?.apiKeys ?? []),
    [providerOverride?.apiKeys],
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
  return (
    <WebSearchApiServiceApiKeysField
      apiKeysInput={apiKeysInput}
      apiKeysVisible={apiKeysVisible}
      onApiKeysInputChange={handleApiKeysCommit}
      onManagePress={openApiKeySettings}
      onToggleVisible={handleApiKeysVisibilityToggle}
    />
  );
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
