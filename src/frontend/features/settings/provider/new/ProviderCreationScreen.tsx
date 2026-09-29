import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type FirstUseSetupIntent,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import type { ProviderConfigurationIssue } from '@/shared/contracts';

import { useProviderApiServiceSheetClose } from '../apiService';
import {
  ProviderConfiguration,
  ProviderConfigurationContinue,
  useNewProviderConfiguration,
  useSavedProviderConfiguration,
} from '../components/ProviderConfiguration';
import { useProviderSetup, type ProviderSetupIntent } from '../hooks/useProviderSetup';

/**
 * Connecting a provider: a preset imported from the catalog, or a custom provider created
 * here. Both render the shared provider configuration; onboarding reuses this screen with a
 * step header and continues to model selection instead of provider setup.
 */
export default function ProviderCreationScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
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
      setupIntent={setupIntent}
    />
  ) : (
    <NewProviderScreen returnTo={returnTo} setupIntent={setupIntent} />
  );
}

function OnboardingHeader() {
  const { t } = useTranslation();

  return (
    <View className="gap-2 px-5 pt-5">
      <Text className="text-xs text-muted-foreground">{t('onboarding.step', { current: 2 })}</Text>
      <Text className="text-base text-foreground">{t('onboarding.connection.description')}</Text>
    </View>
  );
}

function NewProviderScreen({
  returnTo,
  setupIntent,
}: {
  returnTo: string;
  setupIntent?: FirstUseSetupIntent;
}) {
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
      if (setupIntent === 'chat') {
        router.setParams({ providerId: created.providerId, providerName: created.providerName });
        router.push({ params: { providerId: created.providerId }, pathname: '/onboarding/model' });
        return;
      }
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
  }, [allowNavigation, create, returnTo, router, setupIntent]);

  return (
    <>
      <RouteHeader onBack={requestClose} title={t('settings.provider.add.title')} />
      <ProviderConfiguration
        bottomAction={
          <ProviderConfigurationContinue
            disabled={!configuration.canContinue || configuration.isCreating}
            hint={configuration.continueHint}
            label={t('settings.provider.config.continue')}
            loading={configuration.isCreating}
            onPress={handleContinue}
            testID="provider-continue"
          />
        }
        header={setupIntent === 'chat' ? <OnboardingHeader /> : undefined}
        testID={setupIntent === 'chat' ? 'onboarding-connection' : 'provider-configuration'}
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
  setupIntent,
}: {
  intent: ProviderSetupIntent;
  issue?: ProviderConfigurationIssue;
  providerId: string;
  providerName?: string;
  returnTo: string;
  setupIntent?: FirstUseSetupIntent;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPreparing, openSetup } = useProviderSetup();
  const configuration = useSavedProviderConfiguration(providerId);
  const displayedProviderName = configuration.provider?.name ?? providerName ?? '';
  const isBusy = isPreparing || (configuration.value?.isBusy ?? false);
  const handleContinue = useCallback(() => {
    if (setupIntent === 'chat') {
      router.push({ params: { providerId }, pathname: '/onboarding/model' });
      return;
    }
    void openSetup(providerId, returnTo, intent, true);
  }, [intent, openSetup, providerId, returnTo, router, setupIntent]);

  return (
    <>
      <RouteHeader title={t('settings.provider.setup.title', { name: displayedProviderName })} />
      {configuration.isError ? (
        <View className="flex-1 justify-center px-6 py-10">
          <ContentState.Error
            primaryAction={{ children: t('common.back'), onPress: () => router.back() }}
            title={t('settings.provider.setup.loadFailed')}
          />
        </View>
      ) : (
        <ProviderConfiguration
          bottomAction={
            <ProviderConfigurationContinue
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
          header={setupIntent === 'chat' ? <OnboardingHeader /> : undefined}
          testID={setupIntent === 'chat' ? 'onboarding-connection' : 'provider-configuration'}
          value={configuration.value}
        />
      )}
    </>
  );
}
