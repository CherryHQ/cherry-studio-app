import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Button, Chip, Input, TextField } from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type TextInputProps, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import type { EndpointType } from '@/shared/data/types/model';

import { ProviderModelNumberField } from '../../../models/components/ProviderModelNumberField';
import { useProviderModelAdd } from '../../../models/hooks/useProviderModelAdd';
import {
  getProviderModelEndpointLabelKey,
  getProviderModelPurposeOptions,
  providerModelAddEndpointOptions,
  splitProviderModelIds,
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
                  <Text className="text-error text-xs">{endpointTypeError}</Text>
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
                    <ProviderModelNumberField
                      disabled={isSubmitting}
                      label={t('settings.provider.models.addContextWindowLabel')}
                      placeholder={t('settings.provider.models.addContextWindowPlaceholder')}
                      value={formState.contextWindow}
                      onChangeText={updateContextWindow}
                      onFocus={handleAdvancedFieldFocus}
                    />
                    <ProviderModelNumberField
                      disabled={isSubmitting}
                      label={t('settings.provider.models.addMaxInputTokensLabel')}
                      placeholder={t('settings.provider.models.addMaxInputTokensPlaceholder')}
                      value={formState.maxInputTokens}
                      onChangeText={updateMaxInputTokens}
                      onFocus={handleAdvancedFieldFocus}
                    />
                    <ProviderModelNumberField
                      disabled={isSubmitting}
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
