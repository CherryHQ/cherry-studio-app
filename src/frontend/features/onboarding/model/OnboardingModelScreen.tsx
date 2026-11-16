import { useQuery as useWorkflowQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import {
  OnboardingButton,
  OnboardingField,
  OnboardingMessage,
  OnboardingPage,
} from '../components/OnboardingPage';
import { OnboardingModelList } from './OnboardingModelList';
import { useCompleteOnboarding } from './useCompleteOnboarding';
import { useOnboardingModels } from './useOnboardingModels';

export function OnboardingModelScreen() {
  const params = useLocalSearchParams<{
    connectionId?: string | string[];
    providerId?: string | string[];
  }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const providerId = getSingleRouteParam(params.providerId);
  // Changing the setup source discards its selection and manual draft.
  return (
    <OnboardingModelSelection
      connectionId={connectionId}
      key={`${providerId ?? 'all'}:${connectionId ?? 'manual'}`}
      providerId={providerId}
    />
  );
}

function OnboardingModelSelection({
  connectionId,
  providerId,
}: {
  connectionId?: string;
  providerId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const providers = useBackendModule('providers');
  const registry = useWorkflowQuery({
    queryKey: queryKeys.providers.registryReady(),
    queryFn: async () => {
      await providers.ensureRegistryReady();
      return true;
    },
    retry: false,
    staleTime: Infinity,
  });
  const data = useOnboardingModels(providerId);
  const { complete, isSaving: isBusy, cancel } = useCompleteOnboarding();
  const openProviderSetup = () => router.replace('/onboarding/provider');
  const syncAgain = () =>
    router.replace({ pathname: '/onboarding/provider-sync', params: { connectionId } });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<'catalog' | 'manual'>('catalog');
  const [manualId, setManualId] = useState('');
  const selectedModel =
    data.items.find((model) => model.id === selectedId) ??
    (data.items.length === 1 ? data.items[0] : undefined);
  const canStart =
    selectionMode === 'manual' ? Boolean(data.provider && manualId.trim()) : Boolean(selectedModel);
  const shouldEditConnection = Boolean(providerId) && data.loadError?.action === 'editConnection';
  const isShowingLoadError =
    selectionMode === 'catalog' && !data.isLoading && Boolean(data.loadError);

  const editConnection = () => {
    cancel();
    router.replace({
      pathname: '/onboarding/connection',
      params: { providerId: selectedModel?.providerId ?? providerId, connectionId },
    });
  };
  const start = () => {
    if (!canStart || isBusy || data.isLoading || data.error) return;
    Keyboard.dismiss();
    if (selectionMode === 'manual' && data.provider) {
      const existing = data.localModels.find(
        (model) => model.providerId === providerId && model.modelId === manualId.trim(),
      );
      void complete(
        existing
          ? { kind: 'catalog', model: existing, isLocal: true }
          : { kind: 'manual', modelId: manualId.trim(), provider: data.provider },
      );
    } else if (selectedModel) {
      void complete({
        kind: 'catalog',
        model: selectedModel,
        isLocal: data.localModels.some((model) => model.id === selectedModel.id),
      });
    }
  };

  const loading = (!registry.data && (registry.isPending || registry.isFetching)) || data.isLoading;
  return (
    <OnboardingPage
      description={t('onboarding.model.description')}
      footer={
        <>
          {(selectionMode === 'manual' || data.items.length > 0) && !loading ? (
            <OnboardingButton
              disabled={!canStart || Boolean(data.error)}
              loading={isBusy}
              onPress={start}
              testID="onboarding-model-start"
            >
              {t(isBusy ? 'onboarding.model.saving' : 'onboarding.model.continue')}
            </OnboardingButton>
          ) : null}
          {isBusy ? (
            <OnboardingButton onPress={cancel} variant="text">
              {t('common.cancel')}
            </OnboardingButton>
          ) : providerId && data.provider ? (
            <OnboardingButton
              onPress={() => setSelectionMode(selectionMode === 'manual' ? 'catalog' : 'manual')}
              testID="onboarding-model-mode-toggle"
              variant="text"
            >
              {t(
                selectionMode === 'manual'
                  ? 'onboarding.model.chooseFromList'
                  : 'onboarding.model.manual',
              )}
            </OnboardingButton>
          ) : null}
          {!isBusy &&
          (providerId || (connectionId && selectedModel)) &&
          !(isShowingLoadError && shouldEditConnection) ? (
            <OnboardingButton onPress={editConnection} variant="text">
              {t('onboarding.connection.edit')}
            </OnboardingButton>
          ) : null}
        </>
      }
      onBack={isBusy ? undefined : () => router.replace('/onboarding')}
      step={
        providerId || connectionId
          ? { current: 3, total: 3, label: t('onboarding.step', { current: 3 }) }
          : undefined
      }
      testID="onboarding-model"
      title={t('onboarding.model.title')}
      variant="list"
    >
      {!registry.data && registry.isError ? (
        <View className="gap-4 px-6">
          <OnboardingMessage>{t('models.registry.failed')}</OnboardingMessage>
          <OnboardingButton onPress={() => void registry.refetch()}>
            {t('common.retry')}
          </OnboardingButton>
        </View>
      ) : selectionMode === 'manual' && data.provider ? (
        <View className="px-6">
          <OnboardingField
            editable={!isBusy}
            label={t('onboarding.model.manualLabel')}
            onChangeText={setManualId}
            onSubmitEditing={start}
            placeholder={t('onboarding.model.manualPlaceholder')}
            testID="onboarding-model-manual-input"
            value={manualId}
          />
        </View>
      ) : loading ? (
        <View className="px-6">
          <OnboardingMessage loading>{t('onboarding.model.loading')}</OnboardingMessage>
        </View>
      ) : data.loadError ? (
        <View className="gap-4 px-6">
          <OnboardingMessage>
            {t(`onboarding.model.error.${data.loadError.reason}`)}
          </OnboardingMessage>
          <OnboardingButton onPress={shouldEditConnection ? editConnection : data.retry}>
            {t(shouldEditConnection ? 'onboarding.connection.edit' : 'common.retry')}
          </OnboardingButton>
        </View>
      ) : data.items.length === 0 ? (
        <View className="gap-4 px-6">
          <OnboardingMessage>
            {t(
              providerId || connectionId ? 'onboarding.model.empty' : 'onboarding.model.noProvider',
            )}
          </OnboardingMessage>
          <OnboardingButton
            onPress={
              connectionId
                ? syncAgain
                : providerId
                  ? () => setSelectionMode('manual')
                  : openProviderSetup
            }
          >
            {t(
              connectionId
                ? 'onboarding.device.syncAgain'
                : providerId
                  ? 'onboarding.model.manual'
                  : 'onboarding.welcome.connect',
            )}
          </OnboardingButton>
          {connectionId ? (
            <OnboardingButton onPress={openProviderSetup} variant="text">
              {t('onboarding.welcome.connect')}
            </OnboardingButton>
          ) : null}
        </View>
      ) : (
        <OnboardingModelList
          disabled={isBusy}
          models={data.items}
          onSelect={(model) => setSelectedId(model.id)}
          providers={data.providers}
          selectedId={selectedModel?.id}
        >
          {data.pullError ? (
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">
                {t('onboarding.model.savedFallback', {
                  reason: t(`onboarding.model.error.${data.pullError.reason}`),
                })}
              </Text>
              <OnboardingButton
                onPress={data.pullError.action === 'editConnection' ? editConnection : data.retry}
                variant="text"
              >
                {t('common.retry')}
              </OnboardingButton>
            </View>
          ) : null}
        </OnboardingModelList>
      )}
    </OnboardingPage>
  );
}
