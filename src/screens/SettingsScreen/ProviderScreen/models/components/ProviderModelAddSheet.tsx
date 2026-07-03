import { ModalBottomSheet, programmatic } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { Spinner } from 'heroui-native/spinner';
import { cn } from 'heroui-native/utils';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLiquidGlassAvailable } from '@/config/constants';
import type { EndpointType } from '@/data/types/model';

import {
  type ProviderModelAddFormState,
  providerModelAddEndpointOptions,
} from '../utils/providerModelAdd';

const addSheetSnapPointFraction = 0.85;
// Detent indices into `detents`: 0 closed, 1 open.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const advancedSettingsScrollTopPadding = 16;
const defaultKeyboardBottomOffset = 24;
const advancedSettingsKeyboardBottomOffset = 180;
const advancedSettingsKeyboardPadding = 220;
const selectedEndpointTypeColor = '#00b96b';

type ProviderModelAddSheetProps = {
  canSubmit: boolean;
  endpointTypeError?: string;
  formState: ProviderModelAddFormState;
  isOpen: boolean;
  isSubmitting: boolean;
  modelIdError?: string;
  onClose: () => void;
  onContextWindowChange: (value: string) => void;
  onEndpointTypesChange: (endpointTypes: EndpointType[]) => void;
  onGroupChange: (value: string) => void;
  onMaxInputTokensChange: (value: string) => void;
  onMaxOutputTokensChange: (value: string) => void;
  onModelIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  showEndpointTypes: boolean;
};

export function ProviderModelAddSheet({
  canSubmit,
  endpointTypeError,
  formState,
  isOpen,
  isSubmitting,
  modelIdError,
  onClose,
  onContextWindowChange,
  onEndpointTypesChange,
  onGroupChange,
  onMaxInputTokensChange,
  onMaxOutputTokensChange,
  onModelIdChange,
  onNameChange,
  onSubmit,
  showEndpointTypes,
}: ProviderModelAddSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const advancedSettingsScrollYRef = useRef(0);
  const advancedFieldScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  // Adjusted during render (not an effect) from `isOpen`, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * addSheetSnapPointFraction;

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSheetIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }
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
  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    clearAdvancedFieldScrollTimer();
    setShowMoreSettings(false);
    onClose();
  }, [clearAdvancedFieldScrollTimer, isSubmitting, onClose]);
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
  const handleAdvancedSettingsLayout = useCallback((event: LayoutChangeEvent) => {
    advancedSettingsScrollYRef.current = Math.max(
      event.nativeEvent.layout.y - advancedSettingsScrollTopPadding,
      0,
    );
  }, []);
  useEffect(() => clearAdvancedFieldScrollTimer, [clearAdvancedFieldScrollTimer]);
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

  if (!isOpen) {
    return null;
  }

  return (
    <ModalBottomSheet
      detents={[isSubmitting ? programmatic(0) : 0, sheetHeight]}
      index={sheetIndex}
      nativeOverlay
      onIndexChange={setSheetIndex}
      onSettle={(nextIndex) => {
        if (nextIndex === CLOSED_INDEX) {
          handleClose();
        }
      }}
      surface={
        isLiquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            style={[StyleSheet.absoluteFill, styles.surfaceGlass]}
          />
        ) : (
          <View className="rounded-t-3xl bg-background" style={StyleSheet.absoluteFill} />
        )
      }
    >
      <View style={styles.sheetContent}>
        <View style={[styles.sheetViewport, { height: sheetHeight }]}>
          <View className="px-4 pb-3 pt-5">
            <Text className="font-semibold text-foreground text-lg" numberOfLines={1}>
              {t('settings.provider.models.addTitle')}
            </Text>
          </View>

          <KeyboardAwareScrollView
            bottomOffset={
              showMoreSettings ? advancedSettingsKeyboardBottomOffset : defaultKeyboardBottomOffset
            }
            contentContainerStyle={[
              styles.scrollContent,
              showMoreSettings ? styles.expandedScrollContent : null,
            ]}
            disableScrollOnKeyboardHide
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.scrollViewport}
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

          <View className="flex-row items-center gap-3 px-4 pb-4 pt-2">
            <Button
              className="h-9 min-h-0 flex-1 rounded-lg"
              isDisabled={isSubmitting}
              variant="secondary"
              onPress={handleClose}
            >
              <Text className="font-medium text-foreground text-sm">{t('common.cancel')}</Text>
            </Button>
            <Button
              className="h-9 min-h-0 flex-1 rounded-lg"
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
      </View>
    </ModalBottomSheet>
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
      style={
        isSelected
          ? {
              backgroundColor: `${selectedEndpointTypeColor}20`,
            }
          : undefined
      }
    >
      <Text
        className="font-medium text-sm"
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
    paddingVertical: 8,
  },
  expandedScrollContent: {
    paddingBottom: advancedSettingsKeyboardPadding,
  },
  scrollViewport: {
    flex: 1,
    minHeight: 0,
  },
  sheetContent: {
    flex: 1,
  },
  sheetViewport: {
    width: '100%',
  },
  // Matches `rounded-t-3xl`'s --cs-radius-3xl (22px) — GlassView doesn't take
  // className, so the radius is set directly to keep the same silhouette as
  // the non-glass fallback.
  surfaceGlass: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
});
