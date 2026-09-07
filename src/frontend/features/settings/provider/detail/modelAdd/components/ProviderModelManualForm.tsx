import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import {
  Button,
  Chip,
  Input,
  OptionPickerBottomSheet,
  SelectField,
  TextField,
} from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type TextInputProps, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';

import { ProviderModelNumberField } from '../../../models/components/ProviderModelNumberField';
import { useProviderModelAdd } from '../../../models/hooks/useProviderModelAdd';
import {
  getProviderModelEndpointLabelKey,
  getProviderModelAddEndpointOptions,
  type ProviderModelAddEndpoint,
} from '../../../models/utils/providerModelAdd';
import { useProviderModelTask } from '../hooks/useProviderModelTask';
import type { ProviderModelTaskProps } from '../types';
import { ProviderModelSetupCompletion } from './ProviderModelSetupCompletion';

const advancedSettingsScrollTopPadding = 16;
const defaultKeyboardBottomOffset = 0;
const advancedSettingsKeyboardBottomOffset = 180;
const advancedSettingsKeyboardPadding = 220;

export function ProviderModelManualForm({
  provider,
  returnTo,
  shouldEnableProvider,
}: ProviderModelTaskProps) {
  const { t } = useTranslation();
  const {
    baseline,
    canSubmit,
    capabilities,
    defaultName,
    fieldErrors,
    formState,
    isDirty,
    isResolving,
    isSubmitting,
    hasLookupError,
    retryLookup,
    submitAddModel,
    updateCapability,
    updateContextWindow,
    updateEndpointType,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateName,
  } = useProviderModelAdd({ provider });

  const flow = useProviderModelTask({
    provider,
    returnTo,
    shouldEnableProvider,
    hasUnsavedChanges: isDirty,
    isSaving: isSubmitting,
  });
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const advancedSettingsScrollYRef = useRef(0);
  const advancedFieldScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moreSettingsOpen, setShowMoreSettings] = useState(false);
  const [isEndpointOpen, setIsEndpointOpen] = useState(false);
  const showMoreSettings =
    moreSettingsOpen ||
    Object.entries(fieldErrors).some(([field, error]) => field !== 'modelId' && Boolean(error));
  const endpointOptions = [
    { value: 'auto' as const, label: t('settings.provider.models.addEndpointAuto') },
    ...getProviderModelAddEndpointOptions(provider).map(({ id, labelKey }) => ({
      value: id,
      label: t(labelKey),
    })),
  ];
  const endpointLabel =
    formState.endpointType === 'auto'
      ? t('settings.provider.models.addEndpointAuto')
      : t(getProviderModelEndpointLabelKey(formState.endpointType));

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

  async function handleSubmit() {
    if (await submitAddModel()) await flow.completeAfterSave();
  }
  const rightActions: HeaderToolbarAction[] =
    flow.hasSavedModels && shouldEnableProvider
      ? []
      : [
          {
            accessibilityLabel: t('settings.provider.models.addSubmit'),
            disabled: isSubmitting || flow.isEnabling || !canSubmit,
            key: 'add-model',
            label:
              isSubmitting || flow.isEnabling
                ? t('common.saving')
                : t('settings.provider.models.add'),
            onPress: () => void handleSubmit(),
            type: 'label',
          },
        ];
  useEffect(() => clearAdvancedFieldScrollTimer, [clearAdvancedFieldScrollTimer]);
  return (
    <>
      <RouteHeader
        onBack={flow.requestClose}
        rightActions={rightActions}
        title={t('settings.provider.models.addTitle')}
      />
      <View className="flex-1">
        {flow.hasSavedModels && shouldEnableProvider ? (
          <ProviderModelSetupCompletion
            isEnabling={flow.isEnabling}
            onComplete={flow.completeFlow}
            onConfigure={flow.openConfiguration}
            onAddModel={flow.openManualAdd}
          />
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
            <View className="gap-4">
              <ProviderModelAddTextField
                required
                accessibilityLabel={t('settings.provider.models.addModelIdLabel')}
                errorMessage={fieldErrors.modelId}
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
                placeholder={defaultName || t('settings.provider.models.addModelNamePlaceholder')}
                value={formState.name}
                onChangeText={updateName}
              />
              {hasLookupError ? (
                <View className="items-start gap-2">
                  <Text className="text-error text-xs">
                    {t('settings.provider.models.addLookupFailed')}
                  </Text>
                  <Button size="inline" variant="ghost" onPress={() => void retryLookup()}>
                    <Button.Label>{t('common.retry')}</Button.Label>
                  </Button>
                </View>
              ) : isResolving ? (
                <Text className="text-muted-foreground text-xs">
                  {t('settings.provider.models.addResolving')}
                </Text>
              ) : null}
            </View>

            <View className="gap-3">
              <Text className="font-medium text-base text-foreground">
                {t('settings.provider.models.addCapabilities')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(['vision', 'drawing'] as const).map((capability) => (
                  <Chip.Selectable
                    accessibilityLabel={t(`settings.provider.models.addCapability.${capability}`)}
                    accessibilityRole="checkbox"
                    disabled={isSubmitting || isResolving || hasLookupError}
                    key={capability}
                    onSelectedChange={(selected) => updateCapability(capability, selected)}
                    selected={capabilities[capability]}
                  >
                    {t(`settings.provider.models.addCapability.${capability}`)}
                  </Chip.Selectable>
                ))}
              </View>
            </View>

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
                  <SelectField
                    accessibilityLabel={t('settings.provider.models.addEndpointTypeLabel')}
                    disabled={isSubmitting || endpointOptions.length === 1}
                    onPress={() => setIsEndpointOpen(true)}
                  >
                    <SelectField.Label>
                      {t('settings.provider.models.addEndpointTypeLabel')}
                    </SelectField.Label>
                    <SelectField.Value>
                      <SelectField.ValueText>{endpointLabel}</SelectField.ValueText>
                    </SelectField.Value>
                  </SelectField>
                  {fieldErrors.endpointType ? (
                    <Text className="text-error text-xs">{fieldErrors.endpointType}</Text>
                  ) : null}
                  {!capabilities.drawing ? (
                    <>
                      <ProviderModelNumberField
                        disabled={isSubmitting}
                        errorMessage={fieldErrors.contextWindow}
                        label={t('settings.provider.models.addContextWindowLabel')}
                        placeholder={
                          baseline?.contextWindow?.toString() ??
                          t('settings.provider.models.addContextWindowPlaceholder')
                        }
                        value={formState.contextWindow}
                        onChangeText={updateContextWindow}
                        onFocus={handleAdvancedFieldFocus}
                      />
                      <ProviderModelNumberField
                        disabled={isSubmitting}
                        errorMessage={fieldErrors.maxInputTokens}
                        label={t('settings.provider.models.addMaxInputTokensLabel')}
                        placeholder={
                          baseline?.maxInputTokens?.toString() ??
                          t('settings.provider.models.addMaxInputTokensPlaceholder')
                        }
                        value={formState.maxInputTokens}
                        onChangeText={updateMaxInputTokens}
                        onFocus={handleAdvancedFieldFocus}
                      />
                      <ProviderModelNumberField
                        disabled={isSubmitting}
                        errorMessage={fieldErrors.maxOutputTokens}
                        label={t('settings.provider.models.addMaxOutputTokensLabel')}
                        placeholder={
                          baseline?.maxOutputTokens?.toString() ??
                          t('settings.provider.models.addMaxOutputTokensPlaceholder')
                        }
                        value={formState.maxOutputTokens}
                        onChangeText={updateMaxOutputTokens}
                        onFocus={handleAdvancedFieldFocus}
                      />
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </KeyboardAwareScrollView>
        )}
      </View>
      {isEndpointOpen ? (
        <OptionPickerBottomSheet<ProviderModelAddEndpoint>
          open
          onClose={() => setIsEndpointOpen(false)}
          title={t('settings.provider.models.addEndpointTypeLabel')}
          options={endpointOptions}
          selectedValue={formState.endpointType}
          onValueChange={updateEndpointType}
          size="compact"
        />
      ) : null}
    </>
  );
}

function ProviderModelAddTextField({
  accessibilityLabel,
  errorMessage,
  isDisabled,
  label,
  onChangeText,
  onFocus,
  placeholder,
  required = false,
  value,
}: {
  accessibilityLabel: string;
  errorMessage?: string;
  isDisabled: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  required?: boolean;
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
      />
      <TextField.Error>{errorMessage}</TextField.Error>
    </TextField>
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
