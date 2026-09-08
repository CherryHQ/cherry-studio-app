import { ContentState } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';

import { useProviderDetailSettings } from '../hooks/useProviderDetailSettings';
import { ProviderModelManualForm } from './components/ProviderModelManualForm';
import { ProviderModelSyncTask } from './components/ProviderModelSyncTask';

export default function ProviderModelAddScreen() {
  const {
    mode,
    enableProvider,
    providerId,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      mode?: string;
      enableProvider?: string;
      providerId?: string;
    }
  >();
  const { t } = useTranslation();
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(
    providerId ?? '',
  );
  const returnTo = readProviderSetupReturnTo(rawReturnTo);
  const task = mode === 'sync' ? 'sync' : 'manual';

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Mount the selected task only once the provider is loaded: the manual form
  // shape and synchronized-model metadata both depend on the provider contract.
  if (!provider) {
    return (
      <>
        <RouteHeader
          title={t(
            task === 'sync'
              ? 'settings.provider.models.syncTitle'
              : 'settings.provider.models.addTitle',
          )}
        />
        <View className="flex-1 justify-center px-6 py-10">
          <ContentState.Loading title={t('settings.provider.loading')} />
        </View>
      </>
    );
  }

  const taskProps = { provider, returnTo, shouldEnableProvider: enableProvider === 'true' };
  return task === 'sync' ? (
    <ProviderModelSyncTask
      key={provider.id}
      {...taskProps}
      hasConfiguredModels={models.length > 0}
      isConfiguredModelsLoading={modelsQuery.isPending}
    />
  ) : (
    <ProviderModelManualForm key={provider.id} {...taskProps} />
  );
}
