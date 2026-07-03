import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { Spinner } from 'heroui-native/spinner';
import { cn } from 'heroui-native/utils';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, type TextInputProps, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { BackHeader } from '@/components/headers';
import type { EndpointType } from '@/data/types/model';
import { useProviderDetailSettings } from './detail';
import {
  type ProviderModelAddFormState,
  providerModelAddEndpointOptions,
  useProviderModelAdd,
} from './models';

const advancedSettingsScrollTopPadding = 16;
const defaultKeyboardBottomOffset = 24;
const advancedSettingsKeyboardBottomOffset = 180;
const advancedSettingsKeyboardPadding = 220;
const selectedEndpointTypeColor = '#00b96b';

export default function ProviderModelAddScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string; providerName?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');
  const {
    canSubmit,
    endpointTypeError,
    formState,
    isSubmitting,
    modelIdError,
    showEndpointTypes,
    submitAddModel,
    updateContextWindow,
    updateEndpointTypes,
    updateGroup,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateName,
  } = useProviderModelAdd({ provider, providerId: providerId ?? '' });

  const handleSubmit = useCallback(async () => {
    const didAdd = await submitAddModel();
    if (didAdd) {
      router.back();
    }
  }, [router, submitAddModel]);

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.addTitle')} />
      <ProviderModelAddForm
        canSubmit={canSubmit}
        endpointTypeError={endpointTypeError}
        formState={formState}
        isSubmitting={isSubmitting}
        modelIdError={modelIdError}
        showEndpointTypes={showEndpointTypes}
        onContextWindowChange={updateContextWindow}
        onEndpointTypesChange={updateEndpointTypes}
        onGroupChange={updateGroup}
        onMaxInputTokensChange={updateMaxInputTokens}
        onMaxOutputTokensChange={updateMaxOutputTokens}
        onModelIdChange={updateModelId}
        onNameChange={updateName}
        onSubmit={handleSubmit}
      />
    </>
  );
}

function ProviderModelAddForm({
  canSubmit,
  endpointTypeError,
  formState,
  isSubmitting,
  modelIdError,
  onContextWindowChange,
  onEndpointTypesChange,
  onGroupChange,
  onMaxInputTokensChange,
  onMaxOutputTokensChange,
  onModelIdChange,
  onNameChange,
  onSubmit,
  showEndpointTypes,
}: {
  canSubmit: boolean;
  endpointTypeError?: string;
  formState: ProviderModelAddFormState;
  isSubmitting: boolean;
  modelIdError?: string;
  onContextWindowChange: (value: string) => void;
  onEndpointTypesChange: (endpointTypes: EndpointType[]) => void;
  onGroupChange: (value: string) => void;
  onMaxInputTokensChange: (value: string) => void;
  onMaxOutputTokensChange: (value: string) => void;
  onModelIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  showEndpointTypes: boolean;
}) {
  const { t } = useTranslation();
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
  const handleSubmit = useCallback(() => {
    clearAdvancedFieldScrollTimer();
    setShowMoreSettings(false);
    void onSubmit();
  }, [clearAdvancedFieldScrollTimer, onSubmit]);
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
  const toggleEndpointType = useCallback(
    (endpointType: EndpointType) => {
      const currentTypes = new Set(formState.endpointTypes);
      if (currentTypes.has(endpointType)) {
        currentTypes.delete(endpointType);
      } else {
        currentTypes.add(endpointType);
      }

      onEndpointTypesChange([...currentTypes]);
    },
    [formState.endpointTypes, onEndpointTypesChange],
  );

  useEffect(() => clearAdvancedFieldScrollTimer, [clearAdvancedFieldScrollTimer]);

  return (
    <View className="flex-1">
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
          onChangeText={onModelIdChange}
        />

        <ProviderModelAddTextField
          accessibilityLabel={t('settings.provider.models.addModelNameLabel')}
          isDisabled={isSubmitting}
          label={t('settings.provider.models.addModelNameLabel')}
          placeholder={t('settings.provider.models.addModelNamePlaceholder')}
          value={formState.name}
          onChangeText={onNameChange}
        />

        <ProviderModelAddTextField
          accessibilityLabel={t('settings.provider.models.addGroupNameLabel')}
          isDisabled={isSubmitting}
          label={t('settings.provider.models.addGroupNameLabel')}
          placeholder={t('settings.provider.models.addGroupNamePlaceholder')}
          value={formState.group}
          onChangeText={onGroupChange}
        />

        {showEndpointTypes ? (
          <View className="gap-2">
            <Text className="font-medium text-default-foreground text-sm">
              {t('settings.provider.models.addEndpointTypeLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {providerModelAddEndpointOptions.map((option) => (
                <EndpointTypeChip
                  key={option.id}
                  isDisabled={isSubmitting}
                  isSelected={formState.endpointTypes.includes(option.id)}
                  label={t(option.labelKey)}
                  onPress={() => toggleEndpointType(option.id)}
                />
              ))}
            </View>
            {endpointTypeError ? (
              <Text className="text-danger text-xs">{endpointTypeError}</Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          accessibilityLabel={t('settings.provider.models.addMoreSettings')}
          accessibilityRole="button"
          className="h-10 flex-row items-center justify-center gap-2 rounded-xl bg-settings-grouped-surface px-3 active:opacity-70 disabled:opacity-40"
          disabled={isSubmitting}
          onPress={toggleMoreSettings}
        >
          <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
            {t('settings.provider.models.addMoreSettings')}
          </Text>
          {showMoreSettings ? (
            <ChevronUpIcon className="size-4 text-default-foreground" strokeWidth={2} />
          ) : (
            <ChevronDownIcon className="size-4 text-default-foreground" strokeWidth={2} />
          )}
        </Pressable>

        {showMoreSettings ? (
          <View className="gap-3" onLayout={handleAdvancedSettingsLayout}>
            <ProviderModelAddNumberField
              accessibilityLabel={t('settings.provider.models.addContextWindowLabel')}
              isDisabled={isSubmitting}
              label={t('settings.provider.models.addContextWindowLabel')}
              placeholder={t('settings.provider.models.addContextWindowPlaceholder')}
              value={formState.contextWindow}
              onChangeText={onContextWindowChange}
              onFocus={handleAdvancedFieldFocus}
            />
            <ProviderModelAddNumberField
              accessibilityLabel={t('settings.provider.models.addMaxInputTokensLabel')}
              isDisabled={isSubmitting}
              label={t('settings.provider.models.addMaxInputTokensLabel')}
              placeholder={t('settings.provider.models.addMaxInputTokensPlaceholder')}
              value={formState.maxInputTokens}
              onChangeText={onMaxInputTokensChange}
              onFocus={handleAdvancedFieldFocus}
            />
            <ProviderModelAddNumberField
              accessibilityLabel={t('settings.provider.models.addMaxOutputTokensLabel')}
              isDisabled={isSubmitting}
              label={t('settings.provider.models.addMaxOutputTokensLabel')}
              placeholder={t('settings.provider.models.addMaxOutputTokensPlaceholder')}
              value={formState.maxOutputTokens}
              onChangeText={onMaxOutputTokensChange}
              onFocus={handleAdvancedFieldFocus}
            />
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View className="border-border border-t px-4 py-3">
        <Button
          className="h-10 min-h-0 rounded-xl"
          isDisabled={isSubmitting || !canSubmit}
          variant="primary"
          onPress={handleSubmit}
        >
          <View className="min-w-0 flex-row items-center justify-center gap-2">
            {isSubmitting ? <Spinner size="sm" /> : null}
            <Text className="font-medium text-sm text-white" numberOfLines={1}>
              {t('settings.provider.models.addSubmit')}
            </Text>
          </View>
        </Button>
      </View>
    </View>
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
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">{label}</Text>
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        className={cn(
          'min-h-10 rounded-xl px-3 py-0 text-base leading-5',
          multiline ? 'h-16' : 'h-10',
        )}
        isDisabled={isDisabled}
        isInvalid={Boolean(errorMessage)}
        multiline={multiline}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="done"
        style={styles.input}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        variant="secondary"
        {...textInputProps}
      />
      {errorMessage ? <Text className="text-danger text-xs">{errorMessage}</Text> : null}
    </View>
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

function EndpointTypeChip({
  isDisabled,
  isSelected,
  label,
  onPress,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      className={cn(
        'h-8 flex-row items-center gap-1 rounded-full px-3 active:opacity-70 disabled:opacity-40',
        isSelected ? null : 'border border-border bg-settings-grouped-surface',
      )}
      disabled={isDisabled}
      onPress={onPress}
      style={isSelected ? { backgroundColor: `${selectedEndpointTypeColor}20` } : undefined}
    >
      <Text
        className="font-medium text-default-foreground text-sm"
        numberOfLines={1}
        style={isSelected ? { color: selectedEndpointTypeColor } : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    verticalAlign: 'middle',
  },
  scrollContent: {
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  expandedScrollContent: {
    paddingBottom: advancedSettingsKeyboardPadding,
  },
});
