import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import {
  Button,
  Chip,
  ContentState,
  Input,
  Tabs,
  TextField,
  useAlert,
} from '@cherrystudio/ui/components';
import { type Href, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  providerModelAddEndpointOptions,
  PROVIDER_MODEL_PURPOSE_OPTIONS,
} from '../../models/utils/providerModelAdd';
import type { ProviderModelPullPreview } from '../../models/utils/providerModelPullPreview';
import { useProviderDetailSettings } from '../hooks/useProviderDetailSettings';
import { ProviderModelPullPreviewContent } from '../modelPull/ProviderModelPullScreen';

const advancedSettingsScrollTopPadding = 16;
const defaultKeyboardBottomOffset = 0;
const advancedSettingsKeyboardBottomOffset = 180;
const advancedSettingsKeyboardPadding = 220;
const EMPTY_PULL_PREVIEW: ProviderModelPullPreview = { added: [], missing: [] };

type ProviderModelAddMode = 'manual' | 'sync';

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
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const returnTo = readProviderSetupReturnTo(rawReturnTo);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Mount the form only once the provider is loaded: it decides which model-routing
  // controls exist, and that block sits directly above the
  // "More settings" control — growing it a commit later moves a live tap target.
  if (!provider) {
    return (
      <>
        <RouteHeader
          title={t(
            returnTo ? 'settings.provider.models.setupTitle' : 'settings.provider.models.addTitle',
          )}
        />
        <View className="flex-1 justify-center px-6 py-10">
          <ContentState.Loading title={t('settings.provider.loading')} />
        </View>
      </>
    );
  }

  return (
    <ProviderModelAddForm
      key={provider.id}
      initialMode={mode === 'manual' ? 'manual' : 'sync'}
      provider={provider}
      returnTo={returnTo}
    />
  );
}

function ProviderModelAddForm({
  initialMode,
  provider,
  returnTo,
}: {
  initialMode: ProviderModelAddMode;
  provider: Provider;
  returnTo?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const [activeMode, setActiveMode] = useState<ProviderModelAddMode>(initialMode);
  const [syncLoadResult, setSyncLoadResult] = useState<ProviderModelPullLoadResult>();
  // Latched rather than derived from `syncLoadResult`, which a retry clears:
  // once the setup flow has offered the way out it keeps offering it, instead
  // of pulling the control back out from under the finger reaching for it.
  const [hasSyncComeBackEmpty, setHasSyncComeBackEmpty] = useState(false);
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
    resetForm,
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
    hasUnsavedChanges: activeMode === 'manual' && isDirty,
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
      if (result !== 'ready') {
        setHasSyncComeBackEmpty(true);
      }
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
  const handleSyncSubmit = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    if (selectedMissingCount === 0) {
      applySyncSelection();
      return;
    }

    alert.confirm({
      confirmLabel: t('settings.provider.models.pullApplySelected', {
        count: selectedIds.size,
      }),
      description: t('settings.provider.models.syncRemoveMessage', {
        count: selectedMissingCount,
      }),
      onConfirm: applySyncSelection,
      title: t('settings.provider.models.syncRemoveTitle'),
    });
  }, [alert, applySyncSelection, selectedIds.size, selectedMissingCount, t]);
  const isSaving = isSubmitting || isApplying;
  const isManualSubmitDisabled = isSubmitting || !canSubmit;
  // Setup hides the switch to keep first-time configuration on a single track.
  // A sync that came back with nothing to add leaves no track: a self-hosted
  // endpoint that does not serve a model list still has to be given one model
  // by hand, or the provider it just created is stranded without any.
  const showsModeTabs = !returnTo || hasSyncComeBackEmpty;
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () =>
      activeMode === 'sync'
        ? []
        : [
            {
              accessibilityLabel: t('settings.provider.models.addSubmit'),
              disabled: isManualSubmitDisabled,
              key: 'add-model',
              label: isSaving ? t('common.saving') : t('settings.provider.models.add'),
              onPress: () => void handleSubmit(),
              type: 'label',
            },
          ],
    [activeMode, handleSubmit, isManualSubmitDisabled, isSaving, t],
  );
  const modeItems = useMemo(
    () => [
      { label: t('settings.provider.models.addMode.sync'), value: 'sync' as const },
      { label: t('settings.provider.models.addMode.manual'), value: 'manual' as const },
    ],
    [t],
  );
  const handleModeChange = useCallback(
    (nextMode: ProviderModelAddMode) => {
      if (nextMode === activeMode || isSaving) {
        return;
      }

      if (activeMode !== 'manual' || !isDirty) {
        setActiveMode(nextMode);
        return;
      }

      alert.confirm({
        confirmLabel: t('common.discard'),
        description: t('settings.provider.apiService.discardMessage'),
        onConfirm: () => {
          resetForm();
          setActiveMode(nextMode);
        },
        role: 'destructive',
        title: t('settings.provider.apiService.discardTitle'),
      });
    },
    [activeMode, alert, isDirty, isSaving, resetForm, t],
  );

  useEffect(() => clearAdvancedFieldScrollTimer, [clearAdvancedFieldScrollTimer]);
  useEffect(() => {
    if (activeMode === 'sync' && !syncLoadStartedRef.current) {
      loadSyncPreview();
    }
  }, [activeMode, loadSyncPreview]);

  return (
    <>
      <RouteHeader
        onBack={requestClose}
        rightActions={rightActions}
        title={t(
          returnTo ? 'settings.provider.models.setupTitle' : 'settings.provider.models.addTitle',
        )}
      />
      {showsModeTabs ? (
        <View className="px-4 pb-3">
          <Tabs
            accessibilityLabel={t('settings.provider.models.addMode.label')}
            items={modeItems}
            onValueChange={handleModeChange}
            value={activeMode}
          />
        </View>
      ) : null}
      <View className="flex-1">
        {activeMode === 'sync' ? (
          preview ? (
            <ProviderModelPullPreviewContent
              isApplying={isApplying}
              onApply={handleSyncSubmit}
              preview={preview}
              provider={provider}
              selectedIds={selectedIds}
              toggleAll={toggleAllSyncModels}
              toggleModel={toggleSyncModel}
            />
          ) : isPreviewLoading || syncLoadResult === undefined ? (
            <View className="px-6 py-10">
              <ContentState.Loading title={t('settings.provider.models.loading')} />
            </View>
          ) : syncLoadResult === 'failed' || syncLoadResult === 'timedOut' ? (
            // The hook reports how the pull ended and says nothing itself: an
            // alert on top of this state would carry the same sentence twice.
            <View className="px-6 py-10">
              <ContentState.Error
                primaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
                title={t(
                  syncLoadResult === 'timedOut'
                    ? 'settings.provider.models.pullTimedOut'
                    : 'settings.provider.models.pullFailed',
                )}
              />
            </View>
          ) : (
            <View className="px-6 py-10">
              <ContentState.Empty
                primaryAction={{ children: t('common.done'), onPress: completeFlow }}
                secondaryAction={{ children: t('common.retry'), onPress: loadSyncPreview }}
                title={t('settings.provider.models.pullUpToDate')}
              />
            </View>
          )
        ) : (
          <KeyboardAwareScrollView
            bottomOffset={
              showMoreSettings ? advancedSettingsKeyboardBottomOffset : defaultKeyboardBottomOffset
            }
            contentContainerStyle={[
              styles.scrollContent,
              showMoreSettings ? styles.expandedScrollContent : null,
            ]}
            contentInsetAdjustmentBehavior="automatic"
            disableScrollOnKeyboardHide
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            mode="layout"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
          >
            <ProviderModelAddTextField
              accessibilityLabel={t('settings.provider.models.addModelIdLabel')}
              errorMessage={modelIdError}
              isDisabled={isSubmitting}
              label={t('settings.provider.models.addModelIdLabel')}
              placeholder={t('settings.provider.models.addModelIdPlaceholder')}
              value={formState.modelId}
              onChangeText={updateModelId}
            />

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

            {modelAddMode === 'endpoint-types' ? (
              <View className="gap-2">
                <Text className="font-medium text-foreground text-sm">
                  {t('settings.provider.models.addEndpointTypeLabel')}
                </Text>
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
              </View>
            ) : null}

            {modelAddMode === 'purpose' ? (
              <View className="gap-2">
                <Text className="font-medium text-foreground text-sm">
                  {t('settings.provider.models.addPurposeLabel')}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {t('settings.provider.models.addPurposeDescription')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {PROVIDER_MODEL_PURPOSE_OPTIONS.map((option) => (
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

                {modelPurpose === 'chat' && chatEndpointTypes.length > 1 ? (
                  <View className="mt-2 gap-2">
                    <Text className="font-medium text-foreground text-sm">
                      {t('settings.provider.models.addChatEndpointLabel')}
                    </Text>
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
              </View>
            ) : null}

            <Button
              accessibilityLabel={t('settings.provider.models.addMoreSettings')}
              disabled={isSubmitting}
              onPress={toggleMoreSettings}
              size="field"
              variant="secondary"
            >
              <Button.Label numberOfLines={1}>
                {t('settings.provider.models.addMoreSettings')}
              </Button.Label>
              {showMoreSettings ? (
                <ChevronUpIcon className="size-4 text-foreground" />
              ) : (
                <ChevronDownIcon className="size-4 text-foreground" />
              )}
            </Button>

            {showMoreSettings ? (
              <View className="gap-3" onLayout={handleAdvancedSettingsLayout}>
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
          </KeyboardAwareScrollView>
        )}
      </View>
    </>
  );
}

function ProviderModelAddTextField({
  accessibilityLabel,
  errorMessage,
  isDisabled,
  label,
  multiline = false,
  onChangeText,
  onFocus,
  placeholder,
  value,
  textInputProps,
}: {
  accessibilityLabel: string;
  errorMessage?: string;
  isDisabled: boolean;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  textInputProps?: Pick<TextInputProps, 'inputMode' | 'keyboardType'>;
  value: string;
}) {
  return (
    <TextField disabled={isDisabled} invalid={Boolean(errorMessage)}>
      <TextField.Label>{label}</TextField.Label>
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="done"
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        {...textInputProps}
      />
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
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  expandedScrollContent: {
    paddingBottom: advancedSettingsKeyboardPadding,
  },
});
