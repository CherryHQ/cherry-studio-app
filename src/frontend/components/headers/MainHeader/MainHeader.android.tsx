import { Stack, useRouter } from 'expo-router';
import { ChevronLeftIcon, SquarePenIcon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { HeaderIconButton } from '../components/HeaderIconButton';
import { MainHeaderAssistantButton, useMainHeaderAssistant } from './MainHeaderAssistantButton';

export function MainHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const separatorColor = useThemeColor('separator');
  const { assistant, openAssistant } = useMainHeaderAssistant();

  const openNewTopic = useCallback(() => {
    router.setParams({ topicId: undefined });
  }, [router]);
  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        className="bg-background"
        style={{ borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth }}
      >
        <View style={{ height: insets.top }} />
        <View className="h-11 flex-row items-center justify-between px-4">
          <HeaderIconButton accessibilityLabel={t('navigation.back')} onPress={goBack}>
            <ChevronLeftIcon className="size-6 text-foreground" strokeWidth={2} />
          </HeaderIconButton>
          <View className="flex-row items-center">
            <HeaderIconButton accessibilityLabel={t('navigation.newChat')} onPress={openNewTopic}>
              <SquarePenIcon className="size-6 text-foreground" strokeWidth={2} />
            </HeaderIconButton>
            {assistant ? (
              <MainHeaderAssistantButton assistant={assistant} onPress={openAssistant} />
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}
