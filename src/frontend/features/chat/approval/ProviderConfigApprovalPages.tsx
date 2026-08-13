import { Trash2Icon } from '@cherrystudio/app-icons';
import { Button, Input, Label, Section, SecureInput, TextField } from '@cherrystudio/ui/components';
import type { ProviderConfigurationManualModel } from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  CherryInOauth,
  CustomProviderForm,
  getEffectiveAuthConfig,
  normalizeApiKeySingleLine,
  ProviderAvatar,
  ProviderModelPullList,
  type ProviderModelPullSectionKey,
  ProviderOauthSection,
  shouldShowApiKeys,
} from '@/frontend/features/settings/providerConfiguration';
import type { ProviderSetupMatchedProvider, ProviderSetupPreview } from '@/shared/contracts';

import {
  customFormValueFromInput,
  customInputFromForm,
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
        contentContainerClassName="px-4 pb-4 pt-2"
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
      contentContainerClassName="gap-5 px-4 pb-4 pt-2"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      mode="layout"
      showsVerticalScrollIndicator={false}
    >
      {provider ? (
        <View className="flex-row items-center gap-3" testID="provider-config-provider-identity">
          <ProviderAvatar
            presetProviderId={provider.presetProviderId}
            providerId={provider.id}
            providerName={provider.name}
            size={36}
          />
          <Text className="min-w-0 flex-1 font-semibold text-foreground text-lg" numberOfLines={1}>
            {provider.name}
          </Text>
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
  onRemoveManualModel: (modelId: string) => void;
  onRemovedModelIdsChange: (ids: ReadonlySet<UniqueModelId>) => void;
  onRetry: () => void;
  onSelectedModelIdsChange: (ids: ReadonlySet<UniqueModelId>) => void;
  preview: ProviderSetupPreview | null;
  removedModelIds: ReadonlySet<UniqueModelId>;
  selectedModelIds: ReadonlySet<UniqueModelId>;
}) {
  const { t } = useTranslation();
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
        contentBottomInset={16}
        footerContent={
          draft.input.manualModels.length > 0 ? (
            <ProviderConfigManualModelsFooter
              disabled={isDisabled}
              manualModels={draft.input.manualModels}
              onRemoveManualModel={onRemoveManualModel}
            />
          ) : undefined
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

function ProviderConfigManualModelsFooter({
  manualModels,
  disabled,
  onRemoveManualModel,
}: {
  manualModels: readonly ProviderConfigurationManualModel[];
  disabled: boolean;
  onRemoveManualModel: (modelId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="pt-5">
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
