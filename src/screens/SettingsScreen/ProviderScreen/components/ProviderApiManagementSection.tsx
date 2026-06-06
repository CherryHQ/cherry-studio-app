import { Switch } from 'heroui-native/switch';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Provider } from '@/data/types/provider';
import {
  ProviderApiServiceApiKeysField,
  ProviderApiServiceEndpointField,
} from '@/screens/SettingsScreen/ProviderScreen/apiService';
import { CherryInOAuth } from './CherryInOAuth';

const CHERRYIN_PROVIDER_ID = 'cherryin';

type ProviderApiManagementSectionProps = {
  apiKeysInput?: string;
  apiKeysVisible: boolean;
  baseUrl?: string;
  isUpdatingEnabled?: boolean;
  onApiKeysInputChange: (value: string) => void;
  onApiKeysManagePress: () => void;
  onApiKeysVisibleToggle: () => void;
  onBaseUrlManagePress: () => void;
  onEnabledChange: (enabled: boolean) => void;
  provider?: Provider;
  showApiKeys: boolean;
  showBaseUrl: boolean;
};

export function ProviderApiManagementSection({
  apiKeysInput = '',
  apiKeysVisible,
  baseUrl = '',
  isUpdatingEnabled,
  onApiKeysInputChange,
  onApiKeysManagePress,
  onApiKeysVisibleToggle,
  onBaseUrlManagePress,
  onEnabledChange,
  provider,
  showApiKeys,
  showBaseUrl,
}: ProviderApiManagementSectionProps) {
  const { t } = useTranslation();

  // CherryIN supports OAuth login — show the OAuth card whenever it's CherryIN
  const isCherryIn = provider?.id === CHERRYIN_PROVIDER_ID;

  return (
    <View className="gap-3">
      <View className="gap-3">
        <View className="min-h-10 flex-row items-center justify-between gap-4">
          <Text className="font-medium text-default-foreground text-sm">
            {t('settings.provider.apiManagement.enabled')}
          </Text>
          <Switch
            accessibilityLabel={t('settings.provider.apiManagement.enabled')}
            isDisabled={!provider || isUpdatingEnabled}
            isSelected={provider?.isEnabled ?? false}
            onSelectedChange={onEnabledChange}
          />
        </View>
        {isCherryIn && provider?.id ? <CherryInOAuth providerId={provider.id} /> : null}
        {showBaseUrl ? (
          <ProviderApiServiceEndpointField baseUrl={baseUrl} onManagePress={onBaseUrlManagePress} />
        ) : null}
        {showApiKeys ? (
          <ProviderApiServiceApiKeysField
            apiKeysInput={apiKeysInput}
            apiKeysVisible={apiKeysVisible}
            onApiKeysInputChange={onApiKeysInputChange}
            onManagePress={onApiKeysManagePress}
            onToggleVisible={onApiKeysVisibleToggle}
          />
        ) : null}
      </View>
    </View>
  );
}
