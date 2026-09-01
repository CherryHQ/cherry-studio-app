import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { Button, Spinner, useAlert, useToast } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { InlineSearch, useInlineSearch } from '@/frontend/components/inlineSearch';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';
import type { Model } from '@/shared/data/types/model';

import { ProviderBrandAvatar } from '../components/ProviderAvatar';
import { useProviderAvatar, useProviderAvatarActions } from '../components/providerAvatarStore';
import {
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  buildProviderPrimaryBaseUrlUpdates,
  getEffectiveAuthConfig,
  normalizeApiKeyEntries,
  ProviderApiServiceSaveError,
  shouldShowApiKeys,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from './apiService';
import { ProviderModelList } from './components/ProviderModelList';
import { useProviderDetailSettings } from './detail';
import { ProviderDetailTabs } from './detail/components/ProviderDetailTabs/ProviderDetailTabs';
import type { ProviderDetailTab } from './detail/components/ProviderDetailTabs/types';
import { useProviderDeletion } from './hooks/useProviderDeletion';
import { ProviderModelCheckSection } from './models/components/ProviderModelCheckSection';
import { ProviderModelPurposeTabs } from './models/components/ProviderModelPurposeTabs';
import {
  filterProviderModelsByPurpose,
  getEffectiveProviderModelPurpose,
  getProviderModelPurposeCounts,
  hasMultipleProviderModelPurposes,
  type ProviderModelPurpose,
} from './models/utils/providerModelPurpose';
import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  ProviderForm,
  providerFormAvatarSize,
  resolveProviderFormEndpointTypes,
  useProviderFormDraft,
} from './providerForm';

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
  const [activeTab, setActiveTab] = useState<ProviderDetailTab>('configuration');
  const [modelPurpose, setModelPurpose] = useState<ProviderModelPurpose>('all');
  const [isSaving, setIsSaving] = useState(false);
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(providerId);
  const {
    isFiltering: isModelSearchActive,
    query: modelSearchText,
    results: searchedModels,
    setQuery: setModelSearchText,
  } = useInlineSearch({
    fields: (model: Model) => [model.id, model.modelId, model.name, model.group, model.description],
    items: models,
  });
  const modelPurposeCounts = useMemo(() => getProviderModelPurposeCounts(models), [models]);
  const effectiveModelPurpose = getEffectiveProviderModelPurpose(modelPurpose, modelPurposeCounts);
  const listedModels = useMemo(
    () => filterProviderModelsByPurpose(searchedModels, effectiveModelPurpose),
    [effectiveModelPurpose, searchedModels],
  );
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
  // Gate on all three so the content reaches its final structure on the first frame.
  // Inserting the Base URL / API keys blocks a commit later shifts the model toolbar
  // under a finger that already aimed at it.
  const isProviderDetailLoading =
    providerQuery.isPending || apiKeysQuery.isPending || authConfigQuery.isPending;
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
    endpointTypes,
    isSubmitting: isSaving,
    sourceKey: !isProviderDetailLoading && provider ? provider.id : '',
  });
  const { meta: formMeta, state: formState } = form;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: formMeta.isDirty,
    isSaving,
  });
  const { isDeleting, requestDelete } = useProviderDeletion({ onBeforeDismiss: allowNavigation });
  const handleDelete = useCallback(() => {
    if (provider) {
      requestDelete(provider);
    }
  }, [provider, requestDelete]);
  const handleSave = useCallback(() => {
    if (!provider || !providerId || !formMeta.canSubmit || !formMeta.isDirty) {
      return;
    }

    const trimmedName = formState.name.trim();
    let updates: UpdateProviderInput = {
      name: trimmedName,
    };
    const baseUrlEndpoint = endpointTypes[0];

    if (baseUrlEndpoint) {
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
    }

    const nextApiKeys = buildApiKeyEntriesFromInput(formState.apiKey, apiKeys ?? []);
    const shouldSaveApiKeys = showApiKeys && formState.apiKey !== apiKeysInput;

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
          apiKey: shouldSaveApiKeys ? buildApiKeysInputFromEntries(nextApiKeys) : formState.apiKey,
          endpointUrls: baseUrlEndpoint
            ? {
                ...formState.endpointUrls,
                [baseUrlEndpoint]: (formState.endpointUrls[baseUrlEndpoint] ?? '').trim(),
              }
            : formState.endpointUrls,
          name: trimmedName,
        });
        toast.show({ label: t('settings.provider.toast.saved'), variant: 'success' });
      })
      .catch(() => {
        alert.show({ title: t('settings.provider.apiService.saveFailed') });
      })
      .finally(() => setIsSaving(false));
  }, [
    alert,
    apiKeys,
    apiKeysInput,
    endpointTypes,
    form.actions,
    formMeta.canSubmit,
    formMeta.isDirty,
    formState,
    provider,
    providerAvatars,
    providerId,
    replaceApiKeysMutation,
    saveProviderMutation,
    showApiKeys,
    storedAvatarUri,
    t,
    toast,
  ]);
  const configurationSaveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: !formMeta.canSubmit || !formMeta.isDirty || isDeleting,
        key: 'save-provider',
        label: isSaving ? t('common.saving') : t('common.save'),
        onPress: handleSave,
        type: 'label',
      },
    ],
    [formMeta.canSubmit, formMeta.isDirty, handleSave, isDeleting, isSaving, t],
  );
  const openModelAddSettings = useCallback(() => {
    if (!providerId) {
      return;
    }

    router.push({
      params: {
        // Land on the manual tab: sync pulls the provider's whole remote
        // catalogue the moment it opens, and "+" is just as often one model
        // typed by hand. Switching to the sync tab still pulls, once.
        mode: 'manual',
        ...(provider?.name ? { providerName: provider.name } : {}),
        providerId,
      },
      pathname: '/settings/provider/[providerId]/model-add',
    });
  }, [provider, providerId, router]);
  const modelAddActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.provider.models.addTitle'),
        disabled: !provider,
        icon: PlusIcon,
        key: 'add-provider-model',
        onPress: openModelAddSettings,
        type: 'icon',
      },
    ],
    [openModelAddSettings, provider, t],
  );
  const handleTabChange = useCallback(
    (tab: ProviderDetailTab) => {
      if (isSaving) {
        return;
      }

      setModelSearchText('');
      setModelPurpose('all');
      setActiveTab(tab);
    },
    [isSaving, setModelSearchText],
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
      <RouteHeader
        onBack={requestClose}
        rightActions={activeTab === 'configuration' ? configurationSaveActions : modelAddActions}
        title={
          // The route param is only there to name the page before the record
          // lands; once it has, it is what a rename shows up in.
          provider?.name ?? providerName ?? t('settings.provider.tabs.configuration')
        }
        titleElement={<ProviderDetailTabs onTabChange={handleTabChange} tab={activeTab} />}
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
                <ProviderForm.BaseUrl />
                {showApiKeys ? <ProviderForm.ApiKey /> : null}
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
          {models.length === 0 ? null : (
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
          <ProviderModelList
            groupByPurpose={effectiveModelPurpose === 'all'}
            isFiltered={isModelListFiltered}
            isLoading={modelsQuery.isPending}
            models={listedModels}
            provider={provider}
          />
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
