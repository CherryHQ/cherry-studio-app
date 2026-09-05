import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Alert, Button, ContentState, Spinner, useToast } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { ProviderBrandAvatar } from '@/frontend/components/Avatar';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { SelectionToolbar } from '@/frontend/components/Selection';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { Model } from '@/shared/data/types/model';

import { useProviderApiServiceSheetClose, useProviderConfigurationForm } from '../apiService';
import { ProviderForm, providerFormAvatarSize } from '../components/ProviderForm';
import { useProviderDeletion } from '../hooks/useProviderDeletion';
import { useProviderSetup } from '../hooks/useProviderSetup';
import { ProviderModelCheckSection } from '../models/components/ProviderModelCheckSection';
import { ProviderModelPurposeTabs } from '../models/components/ProviderModelPurposeTabs';
import { useProviderModelManagement } from '../models/hooks/useProviderModelManagement';
import {
  filterProviderModelsByPurpose,
  getEffectiveProviderModelPurpose,
  getProviderModelPurposeCounts,
  hasMultipleProviderModelPurposes,
  type ProviderModelPurpose,
} from '../models/utils/providerModelPurpose';
import { ProviderDetailTabs } from './components/ProviderDetailTabs/ProviderDetailTabs';
import type { ProviderDetailTab } from './components/ProviderDetailTabs/types';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './hooks/useProviderDetailSettings';

export default function ProviderDetailSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();

  if (!providerId) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <ProviderDetailSettings key={providerId} providerId={providerId} providerName={providerName} />
  );
}

function ProviderDetailSettings({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const activeTab: ProviderDetailTab = tab === 'models' ? 'models' : 'configuration';
  const { isPreparing, openSetup } = useProviderSetup();
  const [isSyncPromptOpen, setIsSyncPromptOpen] = useState(false);
  const [modelPurpose, setModelPurpose] = useState<ProviderModelPurpose>('all');
  const { models, modelsQuery } = useProviderDetailSettings(providerId);
  const {
    apiKeys,
    canSubmit: canSubmitProvider,
    createInitialValues: createInitialFormValues,
    form,
    isCustomProvider,
    isLoading: isProviderDetailLoading,
    isSaving,
    modelsQuery: allProviderModelsQuery,
    provider,
    providerQuery,
    requestSave,
    showApiKey: showApiKeys,
  } = useProviderConfigurationForm(providerId);
  const allProviderModels = useMemo(
    () => allProviderModelsQuery.data ?? [],
    [allProviderModelsQuery.data],
  );
  const managedModels = allProviderModels;
  const supportedModelIds = useMemo(
    () => (modelsQuery.data ? new Set(models.map((model) => model.id)) : undefined),
    [models, modelsQuery.data],
  );
  const {
    isFiltering: isModelSearchActive,
    query: modelSearchText,
    results: searchedModels,
    setQuery: setModelSearchText,
  } = useInlineSearch({
    fields: (model: Model) => [model.id, model.modelId, model.name, model.group, model.description],
    items: managedModels,
  });
  const modelPurposeCounts = useMemo(
    () => getProviderModelPurposeCounts(managedModels),
    [managedModels],
  );
  const effectiveModelPurpose = getEffectiveProviderModelPurpose(modelPurpose, modelPurposeCounts);
  const listedModels = useMemo(
    () => filterProviderModelsByPurpose(searchedModels, effectiveModelPurpose),
    [effectiveModelPurpose, searchedModels],
  );
  const management = useProviderModelManagement(providerId, managedModels, listedModels);
  const isModelListFiltered = isModelSearchActive || effectiveModelPurpose !== 'all';
  const showsModelPurposeTabs = hasMultipleProviderModelPurposes(modelPurposeCounts);
  const { meta: formMeta, state: formState } = form;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: formMeta.isDirty && !management.isSelecting,
    isSaving: isSaving || management.isDeleting,
  });
  const { isDeleting, requestDelete } = useProviderDeletion({ onBeforeDismiss: allowNavigation });
  const handleDelete = useCallback(() => {
    if (provider) {
      requestDelete(provider);
    }
  }, [provider, requestDelete]);
  const handleSave = useCallback(
    (onSaved?: () => void) => {
      if (!formMeta.isDirty) return;
      requestSave(() => {
        toast.show({ label: t('settings.provider.toast.saved'), variant: 'success' });
        onSaved?.();
      });
    },
    [formMeta.isDirty, requestSave, t, toast],
  );
  const configurationSaveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: !canSubmitProvider || !formMeta.isDirty || isDeleting,
        key: 'save-provider',
        label: isSaving ? t('common.saving') : t('common.save'),
        onPress: () => handleSave(),
        type: 'label',
      },
    ],
    [canSubmitProvider, formMeta.isDirty, handleSave, isDeleting, isSaving, t],
  );
  const configuredProviderName = provider?.name;
  const startModelSync = useCallback(() => {
    void openSetup(
      providerId,
      `/settings/provider/${encodeURIComponent(providerId)}?tab=models`,
      'sync',
    );
  }, [openSetup, providerId]);
  const openModelSyncSettings = useCallback(() => {
    if (formMeta.isDirty) setIsSyncPromptOpen(true);
    else startModelSync();
  }, [formMeta.isDirty, startModelSync]);

  const openModelAddSettings = useCallback(() => {
    router.push({
      params: {
        mode: 'manual',
        returnTo: `/settings/provider/${encodeURIComponent(providerId)}?tab=models`,
        ...(configuredProviderName ? { providerName: configuredProviderName } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-add',
    });
  }, [configuredProviderName, providerId, router]);
  const modelActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.models.syncTitle'),
        disabled: !provider || isPreparing || isSaving || management.isDeleting,
        icon: RefreshCwIcon,
        key: 'sync-provider-models',
        onPress: openModelSyncSettings,
        type: 'icon',
      },
      {
        accessibilityLabel: t('settings.provider.models.addTitle'),
        disabled: !provider || isPreparing || isSaving || management.isDeleting,
        icon: PlusIcon,
        key: 'add-provider-model',
        onPress: openModelAddSettings,
        type: 'icon',
      },
    ],
    [
      isPreparing,
      isSaving,
      management.isDeleting,
      openModelAddSettings,
      openModelSyncSettings,
      provider,
      t,
    ],
  );
  const handleTabChange = useCallback(
    (tab: ProviderDetailTab) => {
      if (isSaving || management.isSelecting || management.isDeleting) {
        return;
      }

      setModelSearchText('');
      setModelPurpose('all');
      router.setParams({ tab });
    },
    [isSaving, management.isDeleting, management.isSelecting, router, setModelSearchText],
  );
  if (providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Everything below renders the same tree whether or not the data has landed:
  // only the ScrollView's children swap. Branching on `isProviderDetailLoading`
  // one level higher used to reconfigure the native header (string title ->
  // `headerTitle` element) and mount the ScrollView after the push had settled.
  // On a first visit that left the scroll view with a zero top content inset, so
  // the content rendered underneath the header.
  return (
    <>
      <Alert
        isOpen={isSyncPromptOpen}
        onOpenChange={setIsSyncPromptOpen}
        title={t('settings.provider.models.syncRecovery.unsavedTitle')}
        description={t('settings.provider.models.syncRecovery.unsavedDescription')}
        actions={[
          {
            label: t('settings.provider.setup.next'),
            onPress: () => {
              setIsSyncPromptOpen(false);
              handleSave(startModelSync);
            },
          },
          {
            label: t('common.discard'),
            role: 'destructive',
            onPress: () => {
              setIsSyncPromptOpen(false);
              form.actions.reset(createInitialFormValues());
              startModelSync();
            },
          },
          { label: t('common.cancel'), role: 'cancel', onPress: () => setIsSyncPromptOpen(false) },
        ]}
      />
      <RouteHeader
        onBack={management.isSelecting ? management.finishSelection : requestClose}
        rightActions={
          management.isSelecting
            ? [
                {
                  type: 'label',
                  key: 'finish-selection',
                  label: t('common.done'),
                  accessibilityLabel: t('common.done'),
                  disabled: management.isDeleting,
                  onPress: management.finishSelection,
                },
              ]
            : activeTab === 'configuration'
              ? configurationSaveActions
              : modelActions
        }
        title={
          // The route param is only there to name the page before the record
          // lands; once it has, it is what a rename shows up in.
          management.isSelecting
            ? t('settings.provider.models.management.selectedCount', {
                count: management.selectedIds.size,
              })
            : (provider?.name ?? providerName ?? t('settings.provider.tabs.configuration'))
        }
        titleElement={
          management.isSelecting ? undefined : (
            <ProviderDetailTabs onTabChange={handleTabChange} tab={activeTab} />
          )
        }
      />
      {activeTab === 'configuration' ? (
        <KeyboardAwareScrollView
          alwaysBounceVertical={false}
          bottomOffset={keyboardBottomOffset}
          contentContainerStyle={styles.configurationContent}
          contentInsetAdjustmentBehavior="automatic"
          disableScrollOnKeyboardHide
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          mode="layout"
          showsVerticalScrollIndicator={false}
          style={styles.screen}
        >
          {isProviderDetailLoading ? (
            <View className="items-center py-10">
              <Spinner accessibilityLabel={t('settings.provider.loading')} />
            </View>
          ) : (
            <>
              <ProviderForm value={form}>
                <ProviderForm.Avatar>
                  {provider ? (
                    <ProviderBrandAvatar
                      presetProviderId={provider.presetProviderId}
                      providerId={provider.id}
                      providerName={formState.name}
                      shape="circle"
                      size={providerFormAvatarSize}
                    />
                  ) : undefined}
                </ProviderForm.Avatar>
                <ProviderForm.Name />
                {isCustomProvider ? (
                  <>
                    {showApiKeys ? <ProviderForm.ApiKey /> : null}
                    <ProviderForm.Endpoints />
                  </>
                ) : (
                  <>
                    <ProviderForm.BaseUrl />
                    {showApiKeys ? <ProviderForm.ApiKey /> : null}
                  </>
                )}
              </ProviderForm>
              <View className="gap-6 px-4 pb-8">
                <ProviderModelCheckSection
                  apiKeys={apiKeys}
                  isDisabled={formMeta.isDirty}
                  isLoading={modelsQuery.isPending}
                  models={models}
                  provider={provider}
                  providerId={providerId}
                />
                <Button
                  disabled={isDeleting || isSaving}
                  onPress={handleDelete}
                  size="lg"
                  variant="destructive"
                >
                  {t('settings.provider.deleteProvider')}
                </Button>
              </View>
            </>
          )}
        </KeyboardAwareScrollView>
      ) : (
        <>
          {managedModels.length > 0 ? (
            <View className="px-4 py-2">
              <Text className="text-foreground-secondary text-sm">
                {t(
                  management.isSelecting
                    ? 'settings.provider.models.management.scope'
                    : 'settings.provider.models.management.listTitle',
                  { count: managedModels.length },
                )}
              </Text>
            </View>
          ) : null}
          {management.isSelecting || managedModels.length === 0 ? null : (
            <>
              <InlineSearch
                onChangeText={setModelSearchText}
                placeholder={t('modelPicker.searchPlaceholder')}
                value={modelSearchText}
              />
              {showsModelPurposeTabs ? (
                <View className="px-4 pb-3">
                  <ProviderModelPurposeTabs
                    onChange={setModelPurpose}
                    value={effectiveModelPurpose}
                  />
                </View>
              ) : null}
            </>
          )}
          {allProviderModelsQuery.isError ? (
            <View className="px-6 py-10">
              <ContentState.Error
                title={t('settings.provider.models.management.loadFailed')}
                primaryAction={{
                  children: t('common.retry'),
                  onPress: () => void allProviderModelsQuery.refetch(),
                }}
              />
            </View>
          ) : (
            <ProviderModelList
              management={management}
              supportedModelIds={supportedModelIds}
              groupByPurpose={effectiveModelPurpose === 'all'}
              isEndpointSelectionDisabled={formMeta.isDirty || management.isDeleting}
              isFiltered={isModelListFiltered}
              isLoading={allProviderModelsQuery.isPending}
              models={listedModels}
              onAddModelManually={openModelAddSettings}
              onPullModels={openModelSyncSettings}
              provider={provider}
            />
          )}
          {management.isSelecting ? (
            <SelectionToolbar
              isDeleting={management.isDeleting}
              onDelete={() => management.requestDelete()}
              onToggleAll={management.toggleAll}
              selectedCount={management.selectedIds.size}
            />
          ) : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  configurationContent: {
    paddingBottom: 24,
  },
  screen: {
    flex: 1,
  },
});
