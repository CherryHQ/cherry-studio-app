import { PlusIcon, Trash2Icon } from '@cherrystudio/app-icons';
import { Button, Input, Label, Section, SecureInput, TextField } from '@cherrystudio/ui/components';
import type { ProviderConfigurationManualModel } from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  CherryInOauth,
  createInitialProviderModelAddFormState,
  CustomProviderForm,
  getEffectiveAuthConfig,
  getDefaultProviderModelGroupName,
  getProviderChatEndpointTypes,
  getProviderModelAddMode,
  getProviderModelPurposeEndpointType,
  inferProviderModelPurpose,
  normalizeApiKeySingleLine,
  ProviderModelDraftForm,
  ProviderModelPullList,
  type ProviderModelAddFormState,
  type ProviderModelPullSectionKey,
  type ProviderModelPurpose,
  ProviderOauthSection,
  providerModelAddDefaultEndpointType,
  shouldShowApiKeys,
  splitProviderModelIds,
} from '@/frontend/features/settings/providerConfiguration';
import type { ProviderSetupMatchedProvider, ProviderSetupPreview } from '@/shared/contracts';

import {
  customFormValueFromInput,
  customInputFromForm,
  numericProviderConfigDraft,
  type ProviderConfigDraft,
} from './providerConfigDraft';

export function ProviderConfigConfigurationPage({
  draft,
  error,
  isDisabled,
  onChange,
  providerSnapshot,
}: {
  draft: ProviderConfigDraft;
  error: string | null;
  isDisabled: boolean;
  onChange: (draft: ProviderConfigDraft) => void;
  providerSnapshot: ProviderSetupMatchedProvider | null;
}) {
  if (draft.kind === 'custom') {
    return (
      <KeyboardAwareScrollView
        bottomOffset={160}
        contentContainerClassName="px-4 pb-20 pt-2"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        mode="layout"
        showsVerticalScrollIndicator={false}
      >
        <CustomProviderForm
          disabled={isDisabled}
          onChange={(value) =>
            onChange({ ...draft, input: customInputFromForm(draft.input, value) })
          }
          value={customFormValueFromInput(draft.input)}
        />
        {error ? (
          <Text className="pt-3 text-destructive text-sm" selectable>
            {error}
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <BuiltinProviderConfigurationForm
      draft={draft}
      error={error}
      isDisabled={isDisabled}
      providerSnapshot={providerSnapshot}
      onChange={onChange}
    />
  );
}

function BuiltinProviderConfigurationForm({
  draft,
  error,
  isDisabled,
  onChange,
  providerSnapshot,
}: {
  draft: Extract<ProviderConfigDraft, { kind: 'builtin' }>;
  error: string | null;
  isDisabled: boolean;
  onChange: (draft: ProviderConfigDraft) => void;
  providerSnapshot: ProviderSetupMatchedProvider | null;
}) {
  const { t } = useTranslation();
  const provider = providerSnapshot?.provider;
  const showOAuth = provider?.authMethods?.includes('oauth') ?? false;
  const showApiKey = provider
    ? shouldShowApiKeys(getEffectiveAuthConfig(undefined, provider).type, provider)
    : true;

  return (
    <KeyboardAwareScrollView
      bottomOffset={120}
      contentContainerClassName="gap-5 px-4 pb-20 pt-2"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      mode="layout"
      showsVerticalScrollIndicator={false}
    >
      {provider ? (
        <View className="gap-1">
          <Text className="font-semibold text-foreground text-lg">{provider.name}</Text>
          {providerSnapshot.origin ? (
            <Text className="text-foreground-tertiary text-sm" numberOfLines={1} selectable>
              {providerSnapshot.origin}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showOAuth && provider ? (
        provider.id === 'cherryin' ? (
          <CherryInOauth allowLogout={false} provider={provider} />
        ) : (
          <ProviderOauthSection allowLogout={false} provider={provider} />
        )
      ) : null}
      {providerSnapshot?.canEditEndpoint ? (
        <TextField isDisabled={isDisabled}>
          <Label>{t('settings.provider.apiService.baseUrl')}</Label>
          <Input
            accessibilityLabel={t('settings.provider.apiService.baseUrl')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={(baseUrl) => onChange({ ...draft, input: { ...draft.input, baseUrl } })}
            placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
            value={draft.input.baseUrl}
          />
        </TextField>
      ) : null}
      {showApiKey ? (
        <TextField isDisabled={isDisabled}>
          <Label>{t('settings.provider.apiService.apiKey')}</Label>
          <SecureInput
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            disabled={isDisabled}
            lineBreakModeIOS="clip"
            numberOfLines={1}
            onChangeText={(apiKey) =>
              onChange({
                ...draft,
                input: { ...draft.input, apiKey: normalizeApiKeySingleLine(apiKey) },
              })
            }
            placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
            returnKeyType="done"
            scrollEnabled={false}
            value={draft.input.apiKey}
            visibilityAccessibilityLabels={{
              hide: t('settings.provider.apiService.hideApiKeys'),
              show: t('settings.provider.apiService.showApiKeys'),
            }}
          />
        </TextField>
      ) : null}
      {error ? (
        <Text className="text-destructive text-sm" selectable>
          {error}
        </Text>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

export function ProviderConfigModelsPage({
  draft,
  isDisabled,
  onAddManualModels,
  onRemoveManualModel,
  onRemovedModelIdsChange,
  onRetry,
  onSelectedModelIdsChange,
  preview,
  removedModelIds,
  selectedModelIds,
}: {
  draft: ProviderConfigDraft;
  isDisabled: boolean;
  onAddManualModels: (models: ProviderConfigurationManualModel[]) => void;
  onRemoveManualModel: (modelId: string) => void;
  onRemovedModelIdsChange: (ids: ReadonlySet<UniqueModelId>) => void;
  onRetry: () => void;
  onSelectedModelIdsChange: (ids: ReadonlySet<UniqueModelId>) => void;
  preview: ProviderSetupPreview | null;
  removedModelIds: ReadonlySet<UniqueModelId>;
  selectedModelIds: ReadonlySet<UniqueModelId>;
}) {
  const { t } = useTranslation();
  const [showManualForm, setShowManualForm] = useState(false);
  const isSelected = useCallback(
    (section: ProviderModelPullSectionKey, id: UniqueModelId) =>
      (section === 'added' ? selectedModelIds : removedModelIds).has(id),
    [removedModelIds, selectedModelIds],
  );
  const handleToggleModel = useCallback(
    (section: ProviderModelPullSectionKey, id: UniqueModelId) => {
      const selectedIds = section === 'added' ? selectedModelIds : removedModelIds;
      const nextIds = new Set(selectedIds);
      if (!nextIds.delete(id)) nextIds.add(id);
      if (section === 'added') onSelectedModelIdsChange(nextIds);
      else onRemovedModelIdsChange(nextIds);
    },
    [onRemovedModelIdsChange, onSelectedModelIdsChange, removedModelIds, selectedModelIds],
  );
  const handleToggleAll = useCallback(
    (section: ProviderModelPullSectionKey, ids: readonly UniqueModelId[]) => {
      const selectedIds = section === 'added' ? selectedModelIds : removedModelIds;
      const isEverythingSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
      const nextIds = new Set(selectedIds);
      ids.forEach((id) => {
        if (isEverythingSelected) nextIds.delete(id);
        else nextIds.add(id);
      });
      if (section === 'added') onSelectedModelIdsChange(nextIds);
      else onRemovedModelIdsChange(nextIds);
    },
    [onRemovedModelIdsChange, onSelectedModelIdsChange, removedModelIds, selectedModelIds],
  );

  if (!preview) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-destructive text-center text-sm" selectable>
          {t('chat.providerConfig.previewUnavailable')}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView automaticOffset behavior="padding" style={styles.flex}>
      <ProviderModelPullList
        footerContent={
          <ProviderConfigModelsFooter
            disabled={isDisabled}
            manualModels={draft.input.manualModels}
            provider={preview.provider}
            showManualForm={showManualForm}
            onAdd={(models) => {
              onAddManualModels(models);
              setShowManualForm(false);
            }}
            onRemoveManualModel={onRemoveManualModel}
            onShowManualForm={() => setShowManualForm(true)}
          />
        }
        headerContent={<CatalogStatus preview={preview} onRetry={onRetry} />}
        isDisabled={isDisabled}
        isSelected={isSelected}
        preview={preview.models}
        provider={preview.provider}
        searchFieldPlacement="inline"
        onToggleAll={handleToggleAll}
        onToggleModel={handleToggleModel}
      />
    </KeyboardAvoidingView>
  );
}

function ProviderConfigModelsFooter({
  manualModels,
  disabled,
  onRemoveManualModel,
  onAdd,
  onShowManualForm,
  provider,
  showManualForm,
}: {
  manualModels: readonly ProviderConfigurationManualModel[];
  disabled: boolean;
  onRemoveManualModel: (modelId: string) => void;
  onAdd: (models: ProviderConfigurationManualModel[]) => void;
  onShowManualForm: () => void;
  provider: Provider;
  showManualForm: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-5 pt-5">
      {manualModels.length > 0 ? (
        <View>
          <Section.Header
            className="px-0 pb-2"
            title={`${t('chat.providerConfig.manualModels')} (${manualModels.length})`}
          />
          <View className="overflow-hidden rounded-lg bg-grouped-surface">
            {manualModels.map((model, index) => (
              <View key={model.modelId}>
                <Section.Item
                  disabled={disabled}
                  label={model.name || model.modelId}
                  showChevron={false}
                  trailing={
                    <Button
                      accessibilityLabel={t('settings.provider.models.remove')}
                      disabled={disabled}
                      icon={<Trash2Icon className="text-destructive" />}
                      onPress={() => onRemoveManualModel(model.modelId)}
                      size="sm"
                      variant="ghost"
                    />
                  }
                />
                {index < manualModels.length - 1 ? <View className="mx-3 h-px bg-border" /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {showManualForm ? (
        <ManualModelDraftEditor disabled={disabled} provider={provider} onAdd={onAdd} />
      ) : (
        <Button icon={<PlusIcon />} onPress={onShowManualForm} variant="secondary">
          {t('settings.provider.models.addTitle')}
        </Button>
      )}
    </View>
  );
}

function CatalogStatus({
  preview,
  onRetry,
}: {
  preview: ProviderSetupPreview;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (preview.catalogSource === 'skipped') {
    return (
      <View className="gap-2 rounded-md bg-secondary p-3">
        <Text className="text-destructive text-sm" selectable>
          {preview.catalogError ?? t('chat.providerConfig.catalogSkipped')}
        </Text>
        <Button onPress={onRetry} size="sm" variant="secondary">
          {t('chat.providerConfig.retry')}
        </Button>
      </View>
    );
  }
  if (preview.catalogSource === 'api') return null;

  return (
    <Text className="text-foreground-tertiary text-sm">
      {t('chat.providerConfig.registryCatalog')}
    </Text>
  );
}

function ManualModelDraftEditor({
  disabled,
  onAdd,
  provider,
}: {
  disabled: boolean;
  onAdd: (models: ProviderConfigurationManualModel[]) => void;
  provider: Provider;
}) {
  const { t } = useTranslation();
  const chatEndpointTypes = useMemo(() => getProviderChatEndpointTypes(provider), [provider]);
  const defaultChatEndpoint = chatEndpointTypes[0] ?? providerModelAddDefaultEndpointType;
  const [formState, setFormState] = useState<ProviderModelAddFormState>(() =>
    createInitialProviderModelAddFormState(defaultChatEndpoint),
  );
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const modelAddMode = getProviderModelAddMode(provider);
  const modelPurpose = inferProviderModelPurpose(formState.endpointTypes);
  const modelIds = splitProviderModelIds(formState.modelId);
  const endpointTypesValid =
    modelAddMode !== 'endpoint-types' || formState.endpointTypes.length > 0;
  const update = useCallback(
    <TField extends keyof ProviderModelAddFormState>(
      field: TField,
      value: ProviderModelAddFormState[TField],
    ) => setFormState((current) => ({ ...current, [field]: value })),
    [],
  );
  const updateModelId = useCallback(
    (modelId: string) =>
      setFormState((current) => ({
        ...current,
        group: getDefaultProviderModelGroupName(modelId, provider.id),
        modelId,
        name: modelId,
      })),
    [provider.id],
  );
  const add = useCallback(() => {
    setAttempted(true);
    if (modelIds.length === 0 || !endpointTypesValid) return;
    const isBatch = modelIds.length > 1;
    onAdd(
      modelIds.map((modelId) => ({
        contextWindow: numericProviderConfigDraft(formState.contextWindow),
        endpointTypes: modelAddMode === 'legacy' ? [] : [...formState.endpointTypes],
        group: isBatch
          ? getDefaultProviderModelGroupName(modelId, provider.id)
          : formState.group.trim(),
        maxInputTokens: numericProviderConfigDraft(formState.maxInputTokens),
        maxOutputTokens: numericProviderConfigDraft(formState.maxOutputTokens),
        modelId,
        name: isBatch ? modelId : formState.name.trim(),
      })),
    );
  }, [endpointTypesValid, formState, modelAddMode, modelIds, onAdd, provider.id]);

  return (
    <View className="gap-4">
      <ProviderModelDraftForm
        controller={{
          chatEndpointTypes,
          endpointTypeError:
            attempted && !endpointTypesValid
              ? t('settings.provider.models.addEndpointTypeRequired')
              : undefined,
          formState,
          modelAddMode,
          modelIdError:
            attempted && modelIds.length === 0
              ? t('settings.provider.models.addModelIdRequired')
              : undefined,
          modelPurpose,
          updateChatEndpointType: (endpointType) => update('endpointTypes', [endpointType]),
          updateContextWindow: (value) => update('contextWindow', value),
          updateEndpointTypes: (value) => update('endpointTypes', value),
          updateGroup: (value) => update('group', value),
          updateMaxInputTokens: (value) => update('maxInputTokens', value),
          updateMaxOutputTokens: (value) => update('maxOutputTokens', value),
          updateModelId,
          updateModelPurpose: (purpose: ProviderModelPurpose) =>
            update('endpointTypes', [
              getProviderModelPurposeEndpointType(purpose, defaultChatEndpoint),
            ]),
          updateName: (value) => update('name', value),
        }}
        isDisabled={disabled}
        onMoreSettingsVisibilityChange={setShowMoreSettings}
        showMoreSettings={showMoreSettings}
      />
      <Button disabled={disabled} onPress={add} variant="secondary">
        {t('settings.provider.models.addSubmit')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
