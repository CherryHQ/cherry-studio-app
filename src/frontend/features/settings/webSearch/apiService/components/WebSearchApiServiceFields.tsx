import { Section } from '@cherrystudio/ui/components';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { useWebSearchApiManagementContext } from '../../context/WebSearchApiManagementContext';
import { type WebSearchProviderDetailSection } from '../../utils/providerSettings';
import { useWebSearchProviderCheck } from '../hooks/useWebSearchProviderCheck';
import {
  buildWebSearchApiKeysInput,
  parseWebSearchApiKeysInput,
} from '../utils/webSearchApiServiceApiKeys';
import { WebSearchApiServiceApiKeysField } from './WebSearchApiServiceApiKeyFields';

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

function ApiKeysSection() {
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
      </View>
    </Section.Item>
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
    case 'zhipuApiKeyShortcut':
      return <ZhipuApiKeyShortcutSection />;
  }
}
