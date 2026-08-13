import { SaveIcon } from '@cherrystudio/app-icons';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type TextInputProps, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';

import { useProviderDetailSettings } from './detail';
import { ProviderModelDraftForm } from './models/components/ProviderModelDraftForm';
import { useProviderModelAdd } from './models/hooks/useProviderModelAdd';

const advancedSettingsScrollTopPadding = 16;
const defaultKeyboardBottomOffset = 0;
const advancedSettingsKeyboardBottomOffset = 180;
const advancedSettingsKeyboardPadding = 220;

export default function ProviderModelAddScreen() {
  const { providerId } = useLocalSearchParams<{ providerId?: string; providerName?: string }>();
  const { t } = useTranslation();
  const { provider, providerQuery } = useProviderDetailSettings(providerId ?? '');

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Mount the form only once the provider is loaded: it decides which model-routing
  // controls exist, and that block sits directly above the
  // "More settings" control — growing it a commit later moves a live tap target.
  if (!provider) {
    return <BackHeader title={t('settings.provider.models.addTitle')} />;
  }

  return <ProviderModelAddForm provider={provider} />;
}

function ProviderModelAddForm({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    canSubmit,
    chatEndpointTypes,
    endpointTypeError,
    formState,
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
  const handleSubmit = useCallback(async () => {
    const didAdd = await submitAddModel();
    if (didAdd) {
      router.back();
    }
  }, [router, submitAddModel]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        androidIcon: SaveIcon,
        disabled: isSubmitting || !canSubmit,
        icon: 'checkmark',
        key: 'save-model',
        onPress: () => void handleSubmit(),
      },
    ],
    [canSubmit, handleSubmit, isSubmitting, t],
  );

  useEffect(() => clearAdvancedFieldScrollTimer, [clearAdvancedFieldScrollTimer]);

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.provider.models.addTitle')} />
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
          mode="layout"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
        >
          <ProviderModelDraftForm
            controller={{
              chatEndpointTypes,
              endpointTypeError,
              formState,
              modelAddMode,
              modelIdError,
              modelPurpose,
              updateChatEndpointType,
              updateContextWindow,
              updateEndpointTypes,
              updateGroup,
              updateMaxInputTokens,
              updateMaxOutputTokens,
              updateModelId,
              updateModelPurpose,
              updateName,
            }}
            isDisabled={isSubmitting}
            onAdvancedFieldFocus={handleAdvancedFieldFocus}
            onAdvancedSettingsLayout={handleAdvancedSettingsLayout}
            onMoreSettingsVisibilityChange={setShowMoreSettings}
            showMoreSettings={showMoreSettings}
          />
        </KeyboardAwareScrollView>
      </View>
    </>
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
