import { Section } from '@cherrystudio/ui/components';
import type { WebSearchCapability } from '@cherrystudio/universal/data/preference';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { useWebSearchApiManagementContext } from '../../context/WebSearchApiManagementContext';
import {
  getWebSearchCapabilityTitleKey,
  normalizeWebSearchApiHost,
  type WebSearchProviderDetailSection,
} from '../../utils/providerSettings';
import { useWebSearchProviderCheck } from '../hooks/useWebSearchProviderCheck';
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
    <Section.Item
      accessibilityLabel={t('settings.websearch.provider.configureZhipuApiKey')}
      label={t('settings.websearch.provider.configureZhipuApiKey')}
      onPress={openZhipuApiKeySettings}
    />
  );
}

function ApiKeysSection({ includesApiHost }: { includesApiHost: boolean }) {
  const {
    actions: { onProviderOverrideChange },
    state: { capability, provider, providerOverride },
  } = useWebSearchApiManagementContext();
  const { isChecking, startCheck } = useWebSearchProviderCheck(
    provider,
    providerOverride,
    capability,
  );
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

  return (
    <Section.Item>
      <View className="gap-4">
        <WebSearchApiServiceApiKeysField
          apiKeysInput={apiKeysInput}
          isChecking={isChecking}
          onCheck={(apiKey) => void startCheck(apiKey)}
          onApiKeysInputChange={handleApiKeysCommit}
        />
        {includesApiHost ? <CapabilityApiHostFields capability={capability} /> : null}
      </View>
    </Section.Item>
  );
}

function CapabilityApiHostFields({ capability }: { capability: WebSearchCapability }) {
  const {
    actions: { onCapabilityApiHostChange },
    meta: { t },
    state: { provider, providerOverride },
  } = useWebSearchApiManagementContext();

  return (
    <>
      {provider.capabilities.map((providerCapability) =>
        providerCapability.feature === capability && providerCapability.apiHost !== undefined ? (
          <SettingTextInput
            accessibilityLabel={t(getWebSearchCapabilityTitleKey(providerCapability.feature))}
            key={providerCapability.feature}
            onCommit={(nextValue) =>
              onCapabilityApiHostChange(
                provider.id,
                providerCapability.feature,
                normalizeWebSearchApiHost(nextValue),
              )
            }
            placeholder={providerCapability.apiHost}
            value={
              providerOverride?.capabilities?.[providerCapability.feature]?.apiHost ??
              providerCapability.apiHost
            }
          />
        ) : null,
      )}
    </>
  );
}

function CapabilityApiHostSection({ capability }: { capability: WebSearchCapability }) {
  return (
    <Section.Item>
      <CapabilityApiHostFields capability={capability} />
    </Section.Item>
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
    <Section.Item>
      <View className="gap-4">
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
    </Section.Item>
  );
}

export function WebSearchApiServiceFieldGroup({
  capability,
  combinesApiKeysAndHost,
  section,
}: {
  capability: WebSearchCapability;
  combinesApiKeysAndHost: boolean;
  section: WebSearchProviderDetailSection;
}) {
  switch (section.type) {
    case 'apiKeys':
      return <ApiKeysSection includesApiHost={combinesApiKeysAndHost} />;
    case 'basicAuth':
      return <BasicAuthSection />;
    case 'capabilityApiHosts':
      return combinesApiKeysAndHost ? null : <CapabilityApiHostSection capability={capability} />;
    case 'zhipuApiKeyShortcut':
      return <ZhipuApiKeyShortcutSection />;
  }
}
