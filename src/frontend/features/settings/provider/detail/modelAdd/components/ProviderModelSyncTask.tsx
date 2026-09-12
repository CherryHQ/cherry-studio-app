import { Button, ContentState, useAlert } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';

import {
  useProviderModelPull,
  type ProviderModelPullLoadResult,
} from '../../../models/hooks/useProviderModelPull';
import { useProviderModelPullSelection } from '../../../models/hooks/useProviderModelPullSelection';
import type { ProviderModelPullPreview } from '../../../models/utils/providerModelPullPreview';
import { useProviderModelTask } from '../hooks/useProviderModelTask';
import type { ProviderModelTaskProps } from '../types';
import { ProviderModelPullPreviewContent } from './ProviderModelPullPreviewContent';
import { ProviderModelSetupCompletion } from './ProviderModelSetupCompletion';

const EMPTY_PULL_PREVIEW: ProviderModelPullPreview = { added: [], missing: [] };

export function ProviderModelSyncTask({
  provider,
  returnTo,
  shouldEnableProvider,
  hasConfiguredModels,
  isConfiguredModelsLoading,
}: ProviderModelTaskProps & { hasConfiguredModels: boolean; isConfiguredModelsLoading: boolean }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [syncLoadResult, setSyncLoadResult] = useState<ProviderModelPullLoadResult>();
  const { applyModelChange, cancelPull, isPreviewLoading, loadPullPreview, preview } =
    useProviderModelPull({ providerId: provider.id });
  const {
    applySelection,
    isApplying,
    selectedIds,
    toggleAll: toggleAllSyncModels,
    toggleModel: toggleSyncModel,
  } = useProviderModelPullSelection({
    applyModelChange,
    preview: preview ?? EMPTY_PULL_PREVIEW,
  });
  const {
    completeAfterSave,
    completeFlow,
    hasSavedModels,
    isEnabling,
    openConfiguration,
    openManualAdd,
    requestClose,
  } = useProviderModelTask({
    provider,
    returnTo,
    shouldEnableProvider,
    isSaving: isApplying,
    beforeNavigate: cancelPull,
  });
  const needsConfiguration =
    syncLoadResult === 'authentication' ||
    syncLoadResult === 'missing-api-key' ||
    syncLoadResult === 'disabled-api-keys' ||
    syncLoadResult === 'invalid-endpoint';
  const loadSyncPreview = useCallback(() => {
    setSyncLoadResult(undefined);
    void loadPullPreview().then((result) => {
      if (result !== 'cancelled') setSyncLoadResult(result);
    });
  }, [loadPullPreview]);
  const selectedMissingCount =
    preview?.missing.filter((model) => selectedIds.has(model.id)).length ?? 0;
  const syncSubmitLabel = shouldEnableProvider
    ? t('settings.provider.models.completeSetup')
    : t(
        selectedIds.size === 0
          ? 'settings.provider.models.pullApply'
          : 'settings.provider.models.pullApplySelected',
        { count: selectedIds.size },
      );
  async function applySyncSelection() {
    if (await applySelection()) await completeAfterSave();
  }
  function handleSyncSubmit() {
    if (selectedIds.size === 0 || isApplying || isEnabling) return;
    if (selectedMissingCount === 0) {
      void applySyncSelection();
    } else {
      alert.confirm({
        confirmLabel: syncSubmitLabel,
        description: t('settings.provider.models.syncRemoveMessage', {
          count: selectedMissingCount,
        }),
        onConfirm: applySyncSelection,
        title: t('settings.provider.models.syncRemoveTitle'),
      });
    }
  }
  const rightActions: HeaderToolbarAction[] =
    hasSavedModels || !preview
      ? []
      : [
          {
            accessibilityLabel: syncSubmitLabel,
            disabled: selectedIds.size === 0 || isApplying || isEnabling,
            key: 'apply-model-changes',
            label: isApplying ? t('common.saving') : syncSubmitLabel,
            onPress: handleSyncSubmit,
            type: 'label',
          },
        ];
  useEffect(() => {
    void loadPullPreview().then((result) => {
      if (result !== 'cancelled') setSyncLoadResult(result);
    });
    return cancelPull;
  }, [cancelPull, loadPullPreview]);
  return (
    <>
      <RouteHeader
        onBack={requestClose}
        rightActions={rightActions}
        title={t('settings.provider.models.syncTitle')}
      />
      <View className="flex-1">
        {hasSavedModels && shouldEnableProvider ? (
          <ProviderModelSetupCompletion
            isEnabling={isEnabling}
            onComplete={completeFlow}
            onConfigure={openConfiguration}
            onAddModel={openManualAdd}
          />
        ) : preview ? (
          <ProviderModelPullPreviewContent
            isApplying={isApplying}
            preview={preview}
            provider={provider}
            selectedIds={selectedIds}
            toggleAll={toggleAllSyncModels}
            toggleModel={toggleSyncModel}
          />
        ) : isPreviewLoading ||
          syncLoadResult === undefined ||
          (syncLoadResult === 'empty' && isConfiguredModelsLoading) ? (
          <View className="px-6 py-10">
            <ContentState.Loading title={t('settings.provider.models.pulling')} />
          </View>
        ) : syncLoadResult !== 'empty' && syncLoadResult !== 'ready' ? (
          // The hook reports how the pull ended and says nothing itself: an
          // alert on top of this state would carry the same sentence twice.
          <View className="gap-4 px-6 py-10">
            <ContentState.Error
              description={t('settings.provider.models.syncRecovery.description')}
              primaryAction={
                needsConfiguration
                  ? {
                      children: t('settings.provider.models.syncRecovery.configure'),
                      onPress: openConfiguration,
                    }
                  : { children: t('common.retry'), onPress: loadSyncPreview }
              }
              secondaryAction={
                needsConfiguration
                  ? { children: t('common.retry'), onPress: loadSyncPreview }
                  : {
                      children: t('settings.provider.models.syncRecovery.configure'),
                      onPress: openConfiguration,
                    }
              }
              title={t(`settings.provider.models.syncRecovery.${syncLoadResult}`)}
            />
            <Button onPress={openManualAdd} variant="ghost">
              {t('settings.provider.models.addTitle')}
            </Button>
          </View>
        ) : hasConfiguredModels ? (
          <View className="px-6 py-10">
            <ContentState.Empty
              primaryAction={{
                children: t(
                  shouldEnableProvider ? 'settings.provider.models.completeSetup' : 'common.done',
                ),
                onPress: () => void completeFlow(),
                disabled: isEnabling,
              }}
              secondaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
              title={t('settings.provider.models.pullUpToDate')}
            />
          </View>
        ) : (
          <View className="px-6 py-10">
            <ContentState.Empty
              description={t('settings.provider.models.pullEmptyDescription')}
              primaryAction={{
                children: t('settings.provider.models.addTitle'),
                onPress: openManualAdd,
              }}
              secondaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
              title={t('settings.provider.models.pullEmpty')}
            />
          </View>
        )}
      </View>
    </>
  );
}
