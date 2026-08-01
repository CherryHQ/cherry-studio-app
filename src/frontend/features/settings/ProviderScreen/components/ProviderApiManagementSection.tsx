import { View } from 'react-native';

import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { isOAuthProvider } from '@/shared/oauth';
import { ProviderApiServiceApiKeysField, ProviderApiServiceEndpointField } from '../apiService';
import { CherryInOauth } from './CherryInOauth';

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
  // Whether the provider signs in with OAuth is the registry's answer, not a
  // name check here. The card itself stays CherryIN-specific because the
  // balance it renders is CherryIN's own account surface.
  const showOAuthCard = Boolean(provider?.id && isOAuthProvider(provider.id));

  return (
    <View className="gap-3">
      {showOAuthCard && provider?.id ? <CherryInOauth providerId={provider.id} /> : null}
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
