import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { View } from 'react-native';

import { ProviderApiServiceApiKeysField, ProviderApiServiceEndpointField } from '../apiService';
import { CherryInOauth } from './CherryInOauth';
import { ProviderOauthSection } from './ProviderOauthSection';

type ProviderApiManagementSectionProps = {
  apiKeysInput?: string;
  baseUrl?: string;
  onApiKeysCommit: (value: string) => void;
  onApiKeysManagePress: () => void;
  onBaseUrlCommit: (value: string) => Promise<boolean>;
  onBaseUrlManagePress: () => void;
  provider?: Provider;
  showApiKeys: boolean;
  showBaseUrl: boolean;
};

export function ProviderApiManagementSection({
  apiKeysInput = '',
  baseUrl = '',
  onApiKeysCommit,
  onApiKeysManagePress,
  onBaseUrlCommit,
  onBaseUrlManagePress,
  provider,
  showApiKeys,
  showBaseUrl,
}: ProviderApiManagementSectionProps) {
  // Whether the provider signs in with OAuth is the registry's answer, not a
  // name check here. The card itself stays CherryIN-specific because the
  // balance it renders is CherryIN's own account surface.
  const showOAuthCard = provider?.authMethods?.includes('oauth') ?? false;

  return (
    <View className="gap-3">
      {showOAuthCard && provider ? (
        provider.id === 'cherryin' ? (
          <CherryInOauth provider={provider} />
        ) : (
          <ProviderOauthSection provider={provider} />
        )
      ) : null}
      {showBaseUrl ? (
        <ProviderApiServiceEndpointField
          baseUrl={baseUrl}
          onCommit={onBaseUrlCommit}
          onManagePress={onBaseUrlManagePress}
        />
      ) : null}
      {showApiKeys ? (
        <ProviderApiServiceApiKeysField
          apiKeysInput={apiKeysInput}
          onCommit={onApiKeysCommit}
          onManagePress={onApiKeysManagePress}
        />
      ) : null}
    </View>
  );
}
