import { MenuIcon, SquarePenIcon } from '@cherrystudio/app-icons';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { HeaderIconButton } from '../components/HeaderIconButton';
import { useOpenDrawer } from '../useOpenDrawer';
import { MainHeaderAssistantButton, useMainHeaderAssistant } from './MainHeaderAssistantButton';

export function MainHeader() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const separatorColor = useThemeColor('border-strong');
  const openDrawer = useOpenDrawer();
  const { assistant, openAssistant, openNewTopic } = useMainHeaderAssistant();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        className="bg-background"
        style={{ borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth }}
      >
        <View style={{ height: insets.top }} />
        <View className="h-11 flex-row items-center justify-between px-4">
          {/* The chat surface is the drawer's root scene now: leading action
              opens the sidebar, there is nothing to go back to. */}
          <HeaderIconButton accessibilityLabel={t('navigation.openMenu')} onPress={openDrawer}>
            <MenuIcon className="size-6 text-foreground" />
          </HeaderIconButton>
          <View className="flex-row items-center">
            <HeaderIconButton accessibilityLabel={t('navigation.newChat')} onPress={openNewTopic}>
              <SquarePenIcon className="size-6 text-foreground" />
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
