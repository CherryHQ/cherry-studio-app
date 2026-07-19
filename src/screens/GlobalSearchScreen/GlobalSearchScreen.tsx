import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { isIOS, searchBarAutoFocusDelayMs } from '@/config/constants';

export function GlobalSearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchBarRef = useRef<SearchBarCommands>(null);

  // rn-screens 的 autoFocus 是 Android-only(@platform android),iOS 只能通过
  // ref 命令式 focus,且须等 UISearchController attach 到 navigation bar 之后。
  useFocusEffect(
    useCallback(() => {
      if (!isIOS) return;
      const timer = setTimeout(() => searchBarRef.current?.focus(), searchBarAutoFocusDelayMs);
      return () => clearTimeout(timer);
    }, []),
  );

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />
      <Stack.Screen options={{ headerLargeTitle: false, title: t('navigation.search') }} />
      <Stack.SearchBar
        ref={searchBarRef}
        autoCapitalize="none"
        autoFocus
        hideNavigationBar={false}
        hideWhenScrolling={false}
        obscureBackground={false}
        placeholder={t('navigation.search')}
        onCancelButtonPress={router.back}
        onClose={router.back}
      />
    </>
  );
}
