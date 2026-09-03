import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import {
  Button,
  Chip,
  ContentState,
  Input,
  TextField,
  useAlert,
} from '@cherrystudio/ui/components';
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type TextInputProps, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import {
  readProviderSetupReturnTo,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';
import type { EndpointType } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useProviderApiServiceSheetClose } from '../../apiService';
import { useProviderModelAdd } from '../../models/hooks/useProviderModelAdd';
import {
  useProviderModelPull,
  type ProviderModelPullLoadResult,
} from '../../models/hooks/useProviderModelPull';
import { useProviderModelPullSelection } from '../../models/hooks/useProviderModelPullSelection';
import {
  getProviderModelEndpointLabelKey,
  getProviderModelPurposeOptions,
  providerModelAddEndpointOptions,
  splitProviderModelIds,
} from '../../models/utils/providerModelAdd';
import type { ProviderModelPullPreview } from '../../models/utils/providerModelPullPreview';
import { useProviderDetailSettings } from '../hooks/useProviderDetailSettings';
import { ProviderModelPullPreviewContent } from '../modelPull/ProviderModelPullScreen';

const advancedSettingsScrollTopPadding = 16;
const defaultKeyboardBottomOffset = 0;
const advancedSettingsKeyboardBottomOffset = 180;
const advancedSettingsKeyboardPadding = 220;
const EMPTY_PULL_PREVIEW: ProviderModelPullPreview = { added: [], missing: [] };

type ProviderModelTask = 'manual' | 'sync';

export default function ProviderModelAddScreen() {
  const {
    mode,
    providerId,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      mode?: string;
      providerId?: string;
    }
  >();
  const { t } = useTranslation();
  const { models, modelsQuery, provider, providerQuery } = useProviderDetailSettings(
    providerId ?? '',
  );
  const returnTo = readProviderSetupReturnTo(rawReturnTo);
  const task = mode === 'sync' ? 'sync' : 'manual';

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Mount the selected task only once the provider is loaded: the manual form
  // shape and synchronized-model metadata both depend on the provider contract.
  if (!provider) {
    return (
      <>
        <RouteHeader title={t(getProviderModelScreenTitleKey(task))} />
        <View className="flex-1 justify-center px-6 py-10">
          <ContentState.Loading title={t('settings.provider.loading')} />
        </View>
      </>
    );
  }

  return (
    <ProviderModelAddForm
      key={provider.id}
      hasConfiguredModels={models.length > 0}
      isConfiguredModelsLoading={modelsQuery.isPending}
      provider={provider}
      returnTo={returnTo}
      task={task}
    />
  );
}

function ProviderModelAddForm({
  hasConfiguredModels,
  isConfiguredModelsLoading,
  provider,
  returnTo,
  task,
}: {
  hasConfiguredModels: boolean;
  isConfiguredModelsLoading: boolean;
  provider: Provider;
  returnTo?: string;
  task: ProviderModelTask;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const [syncLoadResult, setSyncLoadResult] = useState<ProviderModelPullLoadResult>();
  const syncLoadStartedRef = useRef(false);
  const {
    canSubmit,
    chatEndpointTypes,
    endpointTypeError,
    formState,
    isDirty,
    isSubmitting,
    modelAddMode,
    modelIdError,
    modelPurpose,
    submitAddModel,
    updateChatEndpointType,
    updateContextWindow,
    updateEndpointTypes,
    updateGroup,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateModelPurpose,
    updateName,
  } = useProviderModelAdd({ provider });
  const { applyModelChange, isPreviewLoading, loadPullPreview, preview } = useProviderModelPull({
    providerId: provider.id,
  });
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
  const { allowNavigation, closeWithoutPrompt, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: task === 'manual' && isDirty,
    isSaving: isSubmitting || isApplying,
  });
  const completeFlow = useCallback(() => {
    if (returnTo) {
      allowNavigation();
      router.dismissTo(returnTo as Href);
      return;
    }

    closeWithoutPrompt();
  }, [allowNavigation, closeWithoutPrompt, returnTo, router]);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const advancedSettingsScrollYRef = useRef(0);
  const advancedFieldScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  const isBatchAdd = splitProviderModelIds(formState.modelId).length > 1;
  const modelPurposeOptions = getProviderModelPurposeOptions(provider);
  const showsModelPurposeOptions = modelPurposeOptions.length > 1;
  const showsChatEndpointOptions = modelPurpose === 'chat' && chatEndpointTypes.length > 1;

  const clearAdvancedFieldScrollTimer = useCallback(() => {
    if (!advancedFieldScrollTimeoutRef.current) {
      return;
    }

    clearTimeout(advancedFieldScrollTimeoutRef.current);
    advancedFieldScrollTimeoutRef.current = null;
  }, []);
  const scrollAdvancedSettingsIntoView = useCallback(() => {
    scrollRef.current?.scrollTo({
      animated: true,
      y: advancedSettingsScrollYRef.current,
    });
  }, []);
  const handleAdvancedFieldFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(() => {
    clearAdvancedFieldScrollTimer();
    scrollAdvancedSettingsIntoView();
    advancedFieldScrollTimeoutRef.current = setTimeout(() => {
      scrollAdvancedSettingsIntoView();
      advancedFieldScrollTimeoutRef.current = null;
    }, 260);
  }, [clearAdvancedFieldScrollTimer, scrollAdvancedSettingsIntoView]);
  const handleAdvancedSettingsLayout = useCallback(
    (event: { nativeEvent: { layout: { y: number } } }) => {
      advancedSettingsScrollYRef.current = Math.max(
        event.nativeEvent.layout.y - advancedSettingsScrollTopPadding,
        0,
      );
    },
    [],
  );
  const toggleMoreSettings = useCallback(() => {
    setShowMoreSettings((current) => !current);
  }, []);
  const handleModelIdChange = useCallback(
    (value: string) => {
      if (splitProviderModelIds(value).length > 1) {
        setShowMoreSettings(false);
      }
      updateModelId(value);
    },
    [updateModelId],
  );
  const selectedEndpointTypes = useMemo(
    () => new Set(formState.endpointTypes),
    [formState.endpointTypes],
  );
  const toggleEndpointType = useCallback(
    (endpointType: EndpointType) => {
      const currentTypes = new Set(selectedEndpointTypes);
      if (currentTypes.has(endpointType)) {
        currentTypes.delete(endpointType);
      } else {
        currentTypes.add(endpointType);
      }

      updateEndpointTypes([...currentTypes]);
    },
    [selectedEndpointTypes, updateEndpointTypes],
  );
  const handleSubmit = useCallback(async () => {
    const didAdd = await submitAddModel();
    if (didAdd) {
      completeFlow();
    }
  }, [completeFlow, submitAddModel]);
  const loadSyncPreview = useCallback(() => {
    syncLoadStartedRef.current = true;
    setSyncLoadResult(undefined);
    void loadPullPreview().then((result) => {
      setSyncLoadResult(result);
    });
  }, [loadPullPreview]);
  const applySyncSelection = useCallback(() => {
    void applySelection().then((didApply) => {
      if (didApply) {
        completeFlow();
      }
    });
  }, [applySelection, completeFlow]);
  const selectedMissingCount = useMemo(
    () => preview?.missing.filter((model) => selectedIds.has(model.id)).length ?? 0,
    [preview, selectedIds],
  );
  const syncSubmitLabel = returnTo
    ? t('settings.provider.models.completeSetup')
    : t(
        selectedIds.size === 0
          ? 'settings.provider.models.pullApply'
          : 'settings.provider.models.pullApplySelected',
        { count: selectedIds.size },
      );
  const handleSyncSubmit = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    if (selectedMissingCount === 0) {
      applySyncSelection();
      return;
    }

    alert.confirm({
      confirmLabel: syncSubmitLabel,
      description: t('settings.provider.models.syncRemoveMessage', {
        count: selectedMissingCount,
      }),
      onConfirm: applySyncSelection,
      title: t('settings.provider.models.syncRemoveTitle'),
    });
  }, [alert, applySyncSelection, selectedIds.size, selectedMissingCount, syncSubmitLabel, t]);
  const isSaving = isSubmitting || isApplying;
  const isManualSubmitDisabled = isSubmitting || !canSubmit;
  const rightActions = useMemo<HeaderToolbarAction[]>(() => {
    if (task === 'sync') {
      if (!preview) {
        return [];
      }

      return [
        {
          accessibilityLabel: syncSubmitLabel,
          disabled: selectedIds.size === 0 || isApplying,
          key: 'apply-model-changes',
          label: isApplying ? t('common.saving') : syncSubmitLabel,
          onPress: handleSyncSubmit,
          type: 'label',
        },
      ];
    }

    return [
      {
        accessibilityLabel: t('settings.provider.models.addSubmit'),
        disabled: isManualSubmitDisabled,
        key: 'add-model',
        label: isSaving ? t('common.saving') : t('settings.provider.models.add'),
        onPress: () => void handleSubmit(),
        type: 'label',
      },
    ];
  }, [
    handleSubmit,
    handleSyncSubmit,
    isApplying,
    isManualSubmitDisabled,
    isSaving,
    preview,
    selectedIds.size,
    syncSubmitLabel,
    task,
    t,
  ]);

  useEffect(() => clearAdvancedFieldScrollTimer, [clearAdvancedFieldScrollTimer]);
  useEffect(() => {
    if (task === 'sync' && !syncLoadStartedRef.current) {
      loadSyncPreview();
    }
  }, [loadSyncPreview, task]);

  return (
    <>
      <RouteHeader
        onBack={requestClose}
        rightActions={rightActions}
        title={t(getProviderModelScreenTitleKey(task))}
      />
      <View className="flex-1">
        {task === 'sync' ? (
          preview ? (
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
          ) : syncLoadResult === 'failed' || syncLoadResult === 'timedOut' ? (
            // The hook reports how the pull ended and says nothing itself: an
            // alert on top of this state would carry the same sentence twice.
            <View className="px-6 py-10">
              <ContentState.Error
                description={t('settings.provider.models.pullFailedDescription')}
                primaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
                title={t(
                  syncLoadResult === 'timedOut'
                    ? 'settings.provider.models.pullTimedOut'
                    : 'settings.provider.models.pullFailed',
                )}
              />
            </View>
          ) : hasConfiguredModels ? (
            <View className="px-6 py-10">
              <ContentState.Empty
                primaryAction={{
                  children: t(returnTo ? 'settings.provider.models.completeSetup' : 'common.done'),
                  onPress: completeFlow,
                }}
                secondaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
                title={t('settings.provider.models.pullUpToDate')}
              />
            </View>
          ) : (
            <View className="px-6 py-10">
              <ContentState.Empty
                description={t('settings.provider.models.pullEmptyDescription')}
                primaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
                title={t('settings.provider.models.pullEmpty')}
              />
            </View>
          )
        ) : (
          <KeyboardAwareScrollView
            bottomOffset={
              showMoreSettings && !isBatchAdd
                ? advancedSettingsKeyboardBottomOffset
                : defaultKeyboardBottomOffset
            }
            contentContainerStyle={[
              styles.scrollContent,
              showMoreSettings && !isBatchAdd ? styles.expandedScrollContent : null,
            ]}
            contentInsetAdjustmentBehavior="automatic"
            disableScrollOnKeyboardHide
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            mode="layout"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-foreground-secondary text-sm">
              {t('settings.provider.models.addManualDescription')}
            </Text>

            <ProviderModelAddSection
              description={t(
                isBatchAdd
                  ? 'settings.provider.models.addBatchDescription'
                  : 'settings.provider.models.addModelInfoDescription',
              )}
              title={t('settings.provider.models.addModelInfoTitle')}
            >
              <ProviderModelAddTextField
                required
                accessibilityLabel={t('settings.provider.models.addModelIdLabel')}
                description={t('settings.provider.models.addModelIdDescription')}
                errorMessage={modelIdError}
                isDisabled={isSubmitting}
                label={t('settings.provider.models.addModelIdLabel')}
                placeholder={t('settings.provider.models.addModelIdPlaceholder')}
                value={formState.modelId}
                onChangeText={handleModelIdChange}
              />

              {!isBatchAdd ? (
                <>
                  <ProviderModelAddTextField
                    accessibilityLabel={t('settings.provider.models.addModelNameLabel')}
                    isDisabled={isSubmitting}
                    label={t('settings.provider.models.addModelNameLabel')}
                    placeholder={t('settings.provider.models.addModelNamePlaceholder')}
                    value={formState.name}
                    onChangeText={updateName}
                  />

                  <ProviderModelAddTextField
                    accessibilityLabel={t('settings.provider.models.addGroupNameLabel')}
                    isDisabled={isSubmitting}
                    label={t('settings.provider.models.addGroupNameLabel')}
                    placeholder={t('settings.provider.models.addGroupNamePlaceholder')}
                    value={formState.group}
                    onChangeText={updateGroup}
                  />
                </>
              ) : null}
            </ProviderModelAddSection>

            {modelAddMode === 'endpoint-types' ? (
              <ProviderModelAddSection
                description={t('settings.provider.models.addEndpointTypeDescription')}
                title={t('settings.provider.models.addEndpointTypeLabel')}
              >
                <View className="flex-row flex-wrap gap-2">
                  {providerModelAddEndpointOptions.map((option) => (
                    <Chip.Selectable
                      accessibilityLabel={t(option.labelKey)}
                      accessibilityRole="checkbox"
                      disabled={isSubmitting}
                      key={option.id}
                      onSelectedChange={() => toggleEndpointType(option.id)}
                      selected={selectedEndpointTypes.has(option.id)}
                    >
                      {t(option.labelKey)}
                    </Chip.Selectable>
                  ))}
                </View>
                {endpointTypeError ? (
                  <Text className="text-destructive text-xs">{endpointTypeError}</Text>
                ) : null}
              </ProviderModelAddSection>
            ) : null}

            {modelAddMode === 'purpose' &&
            (showsModelPurposeOptions || showsChatEndpointOptions) ? (
              <ProviderModelAddSection
                description={t(
                  showsModelPurposeOptions
                    ? 'settings.provider.models.addPurposeDescription'
                    : 'settings.provider.models.addChatEndpointDescription',
                )}
                title={t(
                  showsModelPurposeOptions
                    ? 'settings.provider.models.addPurposeLabel'
                    : 'settings.provider.models.addChatEndpointLabel',
                )}
              >
                {showsModelPurposeOptions ? (
                  <View className="flex-row flex-wrap gap-2">
                    {modelPurposeOptions.map((option) => (
                      <Chip.Selectable
                        accessibilityLabel={t(option.labelKey)}
                        accessibilityRole="radio"
                        disabled={isSubmitting}
                        key={option.id}
                        onSelectedChange={(selected) => {
                          if (selected) {
                            updateModelPurpose(option.id);
                          }
                        }}
                        selected={modelPurpose === option.id}
                      >
                        {t(option.labelKey)}
                      </Chip.Selectable>
                    ))}
                  </View>
                ) : null}

                {showsChatEndpointOptions ? (
                  <View className="gap-2">
                    {showsModelPurposeOptions ? (
                      <>
                        <Text className="font-medium text-foreground text-sm">
                          {t('settings.provider.models.addChatEndpointLabel')}
                        </Text>
                        <Text className="text-muted-foreground text-xs">
                          {t('settings.provider.models.addChatEndpointDescription')}
                        </Text>
                      </>
                    ) : null}
                    <View className="flex-row flex-wrap gap-2">
                      {chatEndpointTypes.map((endpointType) => (
                        <Chip.Selectable
                          accessibilityLabel={t(getProviderModelEndpointLabelKey(endpointType))}
                          accessibilityRole="radio"
                          disabled={isSubmitting}
                          key={endpointType}
                          onSelectedChange={(selected) => {
                            if (selected) {
                              updateChatEndpointType(endpointType);
                            }
                          }}
                          selected={formState.endpointTypes[0] === endpointType}
                        >
                          {t(getProviderModelEndpointLabelKey(endpointType))}
                        </Chip.Selectable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </ProviderModelAddSection>
            ) : null}

            {!isBatchAdd ? (
              <View className="gap-3">
                <View className="items-start">
                  <Button
                    accessibilityLabel={t('settings.provider.models.addMoreSettings')}
                    accessibilityState={{ expanded: showMoreSettings }}
                    disabled={isSubmitting}
                    hitSlop={8}
                    onPress={toggleMoreSettings}
                    size="inline"
                    variant="ghost"
                  >
                    <Button.Label numberOfLines={1}>
                      {t('settings.provider.models.addMoreSettings')}
                    </Button.Label>
                    {showMoreSettings ? (
                      <ChevronUpIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDownIcon className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                </View>

                {showMoreSettings ? (
                  <View className="gap-3" onLayout={handleAdvancedSettingsLayout}>
                    <Text className="text-muted-foreground text-xs">
                      {t('settings.provider.models.addAdvancedDescription')}
                    </Text>
                    <ProviderModelAddNumberField
                      accessibilityLabel={t('settings.provider.models.addContextWindowLabel')}
                      isDisabled={isSubmitting}
                      label={t('settings.provider.models.addContextWindowLabel')}
                      placeholder={t('settings.provider.models.addContextWindowPlaceholder')}
                      value={formState.contextWindow}
                      onChangeText={updateContextWindow}
                      onFocus={handleAdvancedFieldFocus}
                    />
                    <ProviderModelAddNumberField
                      accessibilityLabel={t('settings.provider.models.addMaxInputTokensLabel')}
                      isDisabled={isSubmitting}
                      label={t('settings.provider.models.addMaxInputTokensLabel')}
                      placeholder={t('settings.provider.models.addMaxInputTokensPlaceholder')}
                      value={formState.maxInputTokens}
                      onChangeText={updateMaxInputTokens}
                      onFocus={handleAdvancedFieldFocus}
                    />
                    <ProviderModelAddNumberField
                      accessibilityLabel={t('settings.provider.models.addMaxOutputTokensLabel')}
                      isDisabled={isSubmitting}
                      label={t('settings.provider.models.addMaxOutputTokensLabel')}
                      placeholder={t('settings.provider.models.addMaxOutputTokensPlaceholder')}
                      value={formState.maxOutputTokens}
                      onChangeText={updateMaxOutputTokens}
                      onFocus={handleAdvancedFieldFocus}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </KeyboardAwareScrollView>
        )}
      </View>
    </>
  );
}

function getProviderModelScreenTitleKey(task: ProviderModelTask) {
  return task === 'sync'
    ? 'settings.provider.models.syncTitle'
    : 'settings.provider.models.addTitle';
}

function ProviderModelAddSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="font-medium text-base text-foreground">{title}</Text>
        {description ? <Text className="text-muted-foreground text-xs">{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ProviderModelAddTextField({
  accessibilityLabel,
  description,
  errorMessage,
  isDisabled,
  label,
  onChangeText,
  onFocus,
  placeholder,
  required = false,
  value,
  textInputProps,
}: {
  accessibilityLabel: string;
  description?: string;
  errorMessage?: string;
  isDisabled: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  required?: boolean;
  textInputProps?: Pick<TextInputProps, 'inputMode' | 'keyboardType'>;
  value: string;
}) {
  return (
    <TextField disabled={isDisabled} invalid={Boolean(errorMessage)} required={required}>
      <TextField.Label>{label}</TextField.Label>
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="done"
        value={value}
        {...textInputProps}
      />
      {description ? <TextField.Description>{description}</TextField.Description> : null}
      <TextField.Error>{errorMessage}</TextField.Error>
    </TextField>
  );
}

function ProviderModelAddNumberField({
  accessibilityLabel,
  isDisabled,
  label,
  onChangeText,
  onFocus,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  isDisabled: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  value: string;
}) {
  const handleChangeText = useCallback(
    (nextValue: string) => {
      onChangeText(nextValue.replaceAll(/\D/g, ''));
    },
    [onChangeText],
  );

  return (
    <ProviderModelAddTextField
      accessibilityLabel={accessibilityLabel}
      isDisabled={isDisabled}
      label={label}
      placeholder={placeholder}
      textInputProps={{ inputMode: 'numeric', keyboardType: 'number-pad' }}
      value={value}
      onChangeText={handleChangeText}
      onFocus={onFocus}
    />
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 28,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  expandedScrollContent: {
    paddingBottom: advancedSettingsKeyboardPadding,
  },
});
