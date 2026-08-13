import { Button, Input, Label, Section, TextField } from '@cherrystudio/ui/components';
import type { ProviderConfigurationManualModel } from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import type { TFunction } from 'i18next';
import { CheckIcon, EyeIcon, EyeOffIcon, PlusIcon, Trash2Icon } from 'lucide-uniwind/png';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
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
  type ProviderModelAddFormState,
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
  toggleSetItem,
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
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
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
          <View className="flex-row items-center gap-2">
            <View className="min-w-0 flex-1 overflow-hidden">
              <Input
                accessibilityLabel={t('settings.provider.apiService.apiKey')}
                autoCapitalize="none"
                autoCorrect={false}
                lineBreakModeIOS="clip"
                multiline={false}
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
                secureTextEntry={!apiKeyVisible}
                value={draft.input.apiKey}
              />
            </View>
            <Button
              accessibilityLabel={
                apiKeyVisible
                  ? t('settings.provider.apiService.hideApiKeys')
                  : t('settings.provider.apiService.showApiKeys')
              }
              disabled={isDisabled}
              icon={apiKeyVisible ? <EyeIcon /> : <EyeOffIcon />}
              onPress={() => setApiKeyVisible((visible) => !visible)}
              variant="secondary"
            />
          </View>
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
  const listItems = useMemo(
    () => buildProviderConfigModelListItems(preview?.models, draft.input.manualModels),
    [draft.input.manualModels, preview?.models],
  );
  const listExtraData = useMemo<ProviderConfigModelListExtraData>(
    () => ({
      isDisabled,
      onRemoveManualModel,
      onRemovedModelIdsChange,
      onSelectedModelIdsChange,
      removedModelIds,
      selectedModelIds,
      t,
    }),
    [
      isDisabled,
      onRemoveManualModel,
      onRemovedModelIdsChange,
      onSelectedModelIdsChange,
      removedModelIds,
      selectedModelIds,
      t,
    ],
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
      <LegendList
        contentContainerStyle={styles.modelListContent}
        data={listItems}
        drawDistance={320}
        estimatedItemSize={52}
        extraData={listExtraData}
        getItemType={getProviderConfigModelListItemType}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={providerConfigModelListKeyExtractor}
        ListFooterComponent={
          <ProviderConfigModelsFooter
            disabled={isDisabled}
            provider={preview.provider}
            showManualForm={showManualForm}
            onAdd={(models) => {
              onAddManualModels(models);
              setShowManualForm(false);
            }}
            onShowManualForm={() => setShowManualForm(true)}
          />
        }
        ListHeaderComponent={<CatalogStatus preview={preview} onRetry={onRetry} />}
        maintainVisibleContentPosition={false}
        recycleItems
        renderItem={renderProviderConfigModelListItem}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      />
    </KeyboardAvoidingView>
  );
}

type ProviderConfigModelSection = 'added' | 'manual' | 'missing';

type ProviderConfigModelListItem =
  | {
      count: number;
      isFirstSection: boolean;
      key: string;
      section: ProviderConfigModelSection;
      type: 'section';
    }
  | {
      isFirst: boolean;
      isLast: boolean;
      key: string;
      model: Model;
      section: 'added' | 'missing';
      type: 'catalog-model';
    }
  | {
      isFirst: boolean;
      isLast: boolean;
      key: string;
      model: ProviderConfigurationManualModel;
      type: 'manual-model';
    };

type ProviderConfigModelListExtraData = {
  isDisabled: boolean;
  onRemoveManualModel: (modelId: string) => void;
  onRemovedModelIdsChange: (ids: ReadonlySet<UniqueModelId>) => void;
  onSelectedModelIdsChange: (ids: ReadonlySet<UniqueModelId>) => void;
  removedModelIds: ReadonlySet<UniqueModelId>;
  selectedModelIds: ReadonlySet<UniqueModelId>;
  t: TFunction;
};

function buildProviderConfigModelListItems(
  models: ProviderSetupPreview['models'] | undefined,
  manualModels: readonly ProviderConfigurationManualModel[],
): ProviderConfigModelListItem[] {
  const items: ProviderConfigModelListItem[] = [];
  let sectionCount = 0;

  const addSection = (section: 'added' | 'missing', sectionModels: readonly Model[]): void => {
    if (sectionModels.length === 0) return;
    items.push({
      count: sectionModels.length,
      isFirstSection: sectionCount === 0,
      key: `section:${section}`,
      section,
      type: 'section',
    });
    sectionCount += 1;
    sectionModels.forEach((model, index) => {
      items.push({
        isFirst: index === 0,
        isLast: index === sectionModels.length - 1,
        key: `catalog-model:${section}:${model.id}`,
        model,
        section,
        type: 'catalog-model',
      });
    });
  };

  addSection('added', models?.added ?? []);
  addSection('missing', models?.missing ?? []);

  if (manualModels.length > 0) {
    items.push({
      count: manualModels.length,
      isFirstSection: sectionCount === 0,
      key: 'section:manual',
      section: 'manual',
      type: 'section',
    });
    manualModels.forEach((model, index) => {
      items.push({
        isFirst: index === 0,
        isLast: index === manualModels.length - 1,
        key: `manual-model:${model.modelId}`,
        model,
        type: 'manual-model',
      });
    });
  }

  return items;
}

function providerConfigModelListKeyExtractor(item: ProviderConfigModelListItem): string {
  return item.key;
}

function getProviderConfigModelListItemType(item: ProviderConfigModelListItem): string {
  return item.type;
}

function renderProviderConfigModelListItem({
  extraData,
  item,
}: LegendListRenderItemProps<ProviderConfigModelListItem>) {
  const listData = extraData as ProviderConfigModelListExtraData;

  if (item.type === 'section') {
    const title =
      item.section === 'added'
        ? listData.t('settings.provider.models.pullAddedSection')
        : item.section === 'missing'
          ? listData.t('settings.provider.models.pullMissingSection')
          : listData.t('chat.providerConfig.manualModels');
    return (
      <View className={item.isFirstSection ? 'pb-1' : 'pb-1 pt-5'}>
        <Section.Header title={`${title} (${item.count})`} />
      </View>
    );
  }

  if (item.type === 'manual-model') {
    return (
      <ProviderConfigModelGroupRow isFirst={item.isFirst} isLast={item.isLast}>
        <Section.Item
          disabled={listData.isDisabled}
          label={item.model.name || item.model.modelId}
          showChevron={false}
          trailing={
            <Button
              accessibilityLabel={listData.t('settings.provider.models.remove')}
              disabled={listData.isDisabled}
              icon={<Trash2Icon className="text-destructive" />}
              onPress={() => listData.onRemoveManualModel(item.model.modelId)}
              size="sm"
              variant="ghost"
            />
          }
        />
      </ProviderConfigModelGroupRow>
    );
  }

  const selectedIds =
    item.section === 'added' ? listData.selectedModelIds : listData.removedModelIds;
  const selected = selectedIds.has(item.model.id);
  return (
    <ProviderConfigModelGroupRow isFirst={item.isFirst} isLast={item.isLast}>
      <Section.Item
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        disabled={listData.isDisabled}
        label={item.model.name}
        onPress={() => {
          const nextIds = toggleSetItem(selectedIds, item.model.id);
          if (item.section === 'added') listData.onSelectedModelIdsChange(nextIds);
          else listData.onRemovedModelIdsChange(nextIds);
        }}
        showChevron={false}
        trailing={
          <View
            className={
              selected
                ? item.section === 'missing'
                  ? 'size-5 items-center justify-center rounded border border-destructive bg-destructive'
                  : 'size-5 items-center justify-center rounded border border-primary bg-primary'
                : 'size-5 rounded border border-border'
            }
          >
            {selected ? <CheckIcon className="size-3 text-background" strokeWidth={3} /> : null}
          </View>
        }
      />
    </ProviderConfigModelGroupRow>
  );
}

function ProviderConfigModelGroupRow({
  children,
  isFirst,
  isLast,
}: {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
}) {
  const className =
    isFirst && isLast
      ? 'overflow-hidden rounded-2xl bg-grouped-surface'
      : isFirst
        ? 'overflow-hidden rounded-t-2xl bg-grouped-surface'
        : isLast
          ? 'overflow-hidden rounded-b-2xl bg-grouped-surface'
          : 'overflow-hidden bg-grouped-surface';
  return (
    <View className={className} style={styles.continuousCorners}>
      {children}
      {!isLast ? <View className="mx-3 h-px bg-border" /> : null}
    </View>
  );
}

function ProviderConfigModelsFooter({
  disabled,
  onAdd,
  onShowManualForm,
  provider,
  showManualForm,
}: {
  disabled: boolean;
  onAdd: (models: ProviderConfigurationManualModel[]) => void;
  onShowManualForm: () => void;
  provider: Provider;
  showManualForm: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="pt-5">
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
      <View className="mb-5 gap-2 rounded-md bg-secondary p-3">
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
    <Text className="pb-5 text-foreground-tertiary text-sm">
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
  continuousCorners: {
    borderCurve: 'continuous',
  },
  flex: {
    flex: 1,
  },
  modelListContent: {
    paddingBottom: 80,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
