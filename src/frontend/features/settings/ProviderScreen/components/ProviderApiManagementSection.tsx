import { View } from 'react-native';

import type { Provider } from '@/shared/domain/provider';
import { ProviderApiServiceApiKeysField, ProviderApiServiceEndpointField } from '../apiService';
import { CherryInOauth } from './CherryInOauth';

const CHERRYIN_PROVIDER_ID = 'cherryin';

type ProviderApiManagementSectionProps = {
  apiKeysInput?: string;
  apiKeysVisible: boolean;
  baseUrl?: string;
  onApiKeysManagePress: () => void;
  onApiKeysVisibleToggle: () => void;
  onBaseUrlManagePress: () => void;
  provider?: Provider;
  showApiKeys: boolean;
  showBaseUrl: boolean;
};

export function ProviderApiManagementSection({
  apiKeysInput = '',
  apiKeysVisible,
  baseUrl = '',
  onApiKeysManagePress,
  onApiKeysVisibleToggle,
  onBaseUrlManagePress,
  provider,
  showApiKeys,
  showBaseUrl,
}: ProviderApiManagementSectionProps) {
  // CherryIN supports OAuth login — show the OAuth card whenever it's CherryIN
  const isCherryIn = provider?.id === CHERRYIN_PROVIDER_ID;

  return (
    <View className="gap-3">
      {isCherryIn && provider?.id ? <CherryInOauth providerId={provider.id} /> : null}
      {showBaseUrl ? (
        <ProviderApiServiceEndpointField baseUrl={baseUrl} onManagePress={onBaseUrlManagePress} />
      ) : null}
      {showApiKeys ? (
        <ProviderApiServiceApiKeysField
          apiKeysInput={apiKeysInput}
          apiKeysVisible={apiKeysVisible}
          onManagePress={onApiKeysManagePress}
          onToggleVisible={onApiKeysVisibleToggle}
        />
      ) : null}
    </View>
  );
}
