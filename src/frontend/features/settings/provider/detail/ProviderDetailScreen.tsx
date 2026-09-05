import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import {
  Alert,
  Button,
  ContentState,
  Spinner,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { ProviderBrandAvatar } from '@/frontend/components/Avatar';
import { InlineSearch, useInlineSearch } from '@/frontend/components/InlineSearch';
import { SelectionToolbar } from '@/frontend/components/Selection';
import { useQuery } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';
import type { Model } from '@/shared/data/types/model';

import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  buildProviderPrimaryBaseUrlUpdates,
  buildProviderTextEndpointUpdates,
  getEffectiveAuthConfig,
  isFullyCustomProvider,
  normalizeApiKeyEntries,
  ProviderApiServiceSaveError,
  shouldShowApiKeys,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from '../apiService';
import {
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  findInvalidCustomProviderEndpointUrl,
  hasConfiguredCustomProviderTextEndpoint,
} from '../apiService/utils/providerApiServiceEndpointRules';
import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  providerDefaultEndpointNeedsRepair,
  ProviderForm,
  providerFormAvatarSize,
  resolveProviderFormEndpointTypes,
  useProviderFormDraft,
} from '../components/ProviderForm';
import { useProviderAvatar, useProviderAvatarActions } from '../hooks/useProviderAvatar';
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
  const { alert } = useAlert();
  const { toast } = useToast();
  const providerAvatars = useProviderAvatarActions();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const activeTab: ProviderDetailTab = tab === 'models' ? 'models' : 'configuration';
  const { isPreparing, openSetup } = useProviderSetup();
  const [isSyncPromptOpen, setIsSyncPromptOpen] = useState(false);
  const [modelPurpose, setModelPurpose] = useState<ProviderModelPurpose>('all');
  const [isSaving, setIsSaving] = useState(false);
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(providerId);
  const isCustomProvider = isFullyCustomProvider(provider);
  const allProviderModelsQuery = useQuery('/models', {
    enabled: Boolean(providerId),
    query: { providerId },
  });
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
  const {
    apiKeys,
    apiKeysQuery,
    authConfig,
    authConfigQuery,
    replaceApiKeysMutation,
    saveProviderMutation,
  } = useProviderApiServiceQueries(providerId);
  const storedAvatarUri = useProviderAvatar(providerId);
  const defaultEndpointNeedsRepair = provider
    ? providerDefaultEndpointNeedsRepair(provider)
    : false;
  const endpointTypes = useMemo(
    () => (provider ? resolveProviderFormEndpointTypes(provider) : []),
    [provider],
  );
  const showApiKeys = shouldShowApiKeys(
    getEffectiveAuthConfig(authConfig, provider).type,
    provider,
  );
  const apiKeysInput = useMemo(
    () => buildApiKeysInputFromEntries(normalizeApiKeyEntries(apiKeys ?? [])),
    [apiKeys],
  );
  // Gate on every required query so the content reaches its final structure on the first frame.
  // Inserting the Base URL / API keys blocks a commit later shifts the model toolbar
  // under a finger that already aimed at it.
  const isProviderDetailLoading =
    providerQuery.isPending ||
    apiKeysQuery.isPending ||
    authConfigQuery.isPending ||
    allProviderModelsQuery.isPending;
  const createInitialFormValues = useCallback(
    () =>
      provider
        ? createProviderFormValues({
            apiKey: apiKeysInput,
            avatarUri: storedAvatarUri ?? null,
            provider,
          })
        : createEmptyProviderFormValues(),
    [apiKeysInput, provider, storedAvatarUri],
  );
  const form = useProviderFormDraft({
    createInitialValues: createInitialFormValues,
    defaultEndpointNeedsRepair,
    endpointTypes,
    initiallyDirty: defaultEndpointNeedsRepair,
    isSubmitting: isSaving,
    normalizeCustomEndpoints: isCustomProvider,
    sourceKey: !isProviderDetailLoading && provider ? provider.id : '',
  });
  const { meta: formMeta, state: formState } = form;
  const customEndpointError = isCustomProvider
    ? findInvalidCustomProviderEndpointUrl(formState.endpointUrls)
    : null;
  const canSubmitProvider =
    formMeta.canSubmit &&
    (!isCustomProvider ||
      (hasConfiguredCustomProviderTextEndpoint(formState.endpointUrls) && !customEndpointError));
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
      if (!provider || !providerId || !canSubmitProvider || !formMeta.isDirty) {
        return;
      }

      const trimmedName = formState.name.trim();
      let updates: UpdateProviderInput = {
        name: trimmedName,
      };
      const baseUrlEndpoint = endpointTypes[0];
      let savedEndpointUrls = formState.endpointUrls;

      if (isCustomProvider) {
        try {
          const endpointUpdates = buildProviderTextEndpointUpdates({
            defaultChatEndpoint: formState.defaultChatEndpoint,
            endpointUrls: formState.endpointUrls,
            provider,
          });
          updates = { ...updates, ...endpointUpdates };
          savedEndpointUrls = Object.fromEntries(
            CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.map((endpointType) => [
              endpointType,
              formState.endpointUrls[endpointType]?.trim() ?? '',
            ]),
          );
        } catch (error) {
          alert.show(
            error instanceof ProviderApiServiceSaveError && error.code === 'missing-text-endpoint'
              ? {
                  description: t('settings.provider.apiService.textEndpointRequired'),
                  title: t('settings.provider.apiService.textEndpointsTitle'),
                }
              : {
                  description: t('settings.provider.apiService.invalidBaseUrlMessage'),
                  title: t('settings.provider.apiService.invalidBaseUrlTitle'),
                },
          );
          return;
        }
      } else if (baseUrlEndpoint) {
        try {
          updates = {
            ...updates,
            ...buildProviderPrimaryBaseUrlUpdates({
              baseUrl: formState.endpointUrls[baseUrlEndpoint] ?? '',
              provider,
            }),
          };
        } catch (error) {
          alert.show(
            error instanceof ProviderApiServiceSaveError
              ? {
                  description: t('settings.provider.apiService.invalidBaseUrlMessage'),
                  title: t('settings.provider.apiService.invalidBaseUrlTitle'),
                }
              : { title: t('settings.provider.apiService.saveFailed') },
          );
          return;
        }
        savedEndpointUrls = {
          ...formState.endpointUrls,
          [baseUrlEndpoint]: (formState.endpointUrls[baseUrlEndpoint] ?? '').trim(),
        };
      }

      const removedEndpointTypes = isCustomProvider
        ? CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.filter(
            (endpointType) =>
              provider.endpointConfigs?.[endpointType]?.baseUrl?.trim() &&
              !updates.endpointConfigs?.[endpointType]?.baseUrl?.trim(),
          )
        : [];
      const referencedModelCount = allProviderModels.filter((model) => {
        const endpointType = model.endpointTypes?.[0];
        return endpointType
          ? removedEndpointTypes.some((removed) => removed === endpointType)
          : false;
      }).length;
      if (referencedModelCount > 0) {
        alert.show({
          description: t('settings.provider.apiService.endpointInUseMessage', {
            count: referencedModelCount,
          }),
          title: t('settings.provider.apiService.endpointInUseTitle'),
        });
        return;
      }

      const nextApiKeys = buildApiKeyEntriesFromInput(formState.apiKey, apiKeys ?? []);
      const shouldSaveApiKeys = showApiKeys && formState.apiKey !== apiKeysInput;
      const persistUpdates = () => {
        Keyboard.dismiss();
        setIsSaving(true);
        void Promise.all([
          saveProviderMutation.mutateAsync(updates),
          shouldSaveApiKeys ? replaceApiKeysMutation.mutateAsync(nextApiKeys) : Promise.resolve(),
        ])
          .then(async () => {
            if (formState.avatarUri !== (storedAvatarUri ?? null)) {
              if (formState.avatarUri) {
                await providerAvatars.persist(providerId, formState.avatarUri);
              } else {
                providerAvatars.remove(providerId);
              }
            }

            form.actions.reset({
              ...formState,
              apiKey: shouldSaveApiKeys
                ? buildApiKeysInputFromEntries(nextApiKeys)
                : formState.apiKey,
              defaultChatEndpoint: updates.defaultChatEndpoint ?? formState.defaultChatEndpoint,
              endpointUrls: savedEndpointUrls,
              name: trimmedName,
            });
            toast.show({ label: t('settings.provider.toast.saved'), variant: 'success' });
            onSaved?.();
          })
          .catch(() => {
            toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' });
          })
          .finally(() => setIsSaving(false));
      };
      const followingModelCount = allProviderModels.filter(
        (model) => !model.endpointTypes?.[0],
      ).length;
      if (
        isCustomProvider &&
        provider.defaultChatEndpoint !== updates.defaultChatEndpoint &&
        followingModelCount > 0
      ) {
        alert.confirm({
          confirmLabel: t('common.save'),
          description: t('settings.provider.apiService.defaultEndpointChangeMessage', {
            count: followingModelCount,
          }),
          onConfirm: persistUpdates,
          title: t('settings.provider.apiService.defaultEndpointChangeTitle'),
        });
        return;
      }

      persistUpdates();
    },
    [
      alert,
      allProviderModels,
      apiKeys,
      apiKeysInput,
      canSubmitProvider,
      endpointTypes,
      form.actions,
      formMeta.isDirty,
      formState,
      isCustomProvider,
      provider,
      providerAvatars,
      providerId,
      replaceApiKeysMutation,
      saveProviderMutation,
      showApiKeys,
      storedAvatarUri,
      t,
      toast,
    ],
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
