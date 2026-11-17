import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import type { ProviderConfigurationIssue } from '@/shared/contracts';

import { useProviderApiServiceSheetClose } from '../apiService';
import { ProviderBottomAction } from '../components/ProviderBottomAction';
import {
  ProviderConfiguration,
  useNewProviderConfiguration,
  useSavedProviderConfiguration,
} from '../components/ProviderConfiguration';
import { useProviderSetup, type ProviderSetupIntent } from '../hooks/useProviderSetup';

/** Regular settings presentation over the shared provider configuration. */
export default function ProviderCreationScreen() {
  const {
    providerId,
    providerName,
    intent,
    issue,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      providerId?: string;
      providerName?: string;
      intent?: string;
      issue?: ProviderConfigurationIssue;
    }
  >();
  const returnTo = readProviderSetupReturnTo(rawReturnTo) ?? '/settings/provider';

  return providerId ? (
    <SavedProviderSetupScreen
      intent={intent === 'sync' ? 'sync' : 'enable'}
      issue={issue}
      providerId={providerId}
      providerName={providerName}
      returnTo={returnTo}
    />
  ) : (
    <NewProviderScreen returnTo={returnTo} />
  );
}

function NewProviderScreen({ returnTo }: { returnTo: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const configuration = useNewProviderConfiguration();
  const create = configuration.create;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: configuration.isDirty,
    isSaving: configuration.isCreating,
  });
  const handleContinue = useCallback(() => {
    void create().then((created) => {
      if (!created) return;
      allowNavigation();
      router.replace({
        params: {
          enableProvider: 'true',
          mode: 'sync',
          providerId: created.providerId,
          providerName: created.providerName,
          returnTo,
        },
        pathname: '/settings/provider/[providerId]/model-add',
      });
    });
  }, [allowNavigation, create, returnTo, router]);

  return (
    <>
      <RouteHeader onBack={requestClose} title={t('settings.provider.add.title')} />
      <ProviderConfiguration
        bottomAction={
          <ProviderBottomAction
            disabled={!configuration.canContinue || configuration.isCreating}
            hint={configuration.continueHint}
            label={t('settings.provider.config.continue')}
            loading={configuration.isCreating}
            onPress={handleContinue}
            testID="provider-continue"
          />
        }
        testID="provider-configuration"
        value={configuration.value}
      />
    </>
  );
}

function SavedProviderSetupScreen({
  intent,
  issue,
  providerId,
  providerName,
  returnTo,
}: {
  intent: ProviderSetupIntent;
  issue?: ProviderConfigurationIssue;
  providerId: string;
  providerName?: string;
  returnTo: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPreparing, openSetup } = useProviderSetup();
  const configuration = useSavedProviderConfiguration(providerId);
  const displayedProviderName = configuration.provider?.name ?? providerName ?? '';
  const isBusy = isPreparing || (configuration.value?.isBusy ?? false);
  const close = () => router.back();
  const handleContinue = useCallback(() => {
    void openSetup(providerId, returnTo, intent, true);
  }, [intent, openSetup, providerId, returnTo]);

  return (
    <>
      <RouteHeader title={t('settings.provider.setup.title', { name: displayedProviderName })} />
      {configuration.isError ? (
        <View className="flex-1 justify-center px-6 py-10">
          <ContentState.Error
            primaryAction={{ children: t('common.back'), onPress: close }}
            title={t('settings.provider.setup.loadFailed')}
          />
        </View>
      ) : (
        <ProviderConfiguration
          bottomAction={
            <ProviderBottomAction
              disabled={!configuration.canContinue || isBusy}
              // A setup issue explains why the user landed here until they fix it.
              hint={
                configuration.continueHint ??
                (issue ? t(`settings.provider.setup.issues.${issue}`) : undefined)
              }
              label={t('settings.provider.config.continue')}
              loading={isPreparing}
              onPress={handleContinue}
              testID="provider-continue"
            />
          }
          testID="provider-configuration"
          value={configuration.value}
        />
      )}
    </>
  );
}
