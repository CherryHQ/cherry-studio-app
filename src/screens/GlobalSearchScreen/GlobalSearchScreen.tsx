import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SearchBarCommands } from 'react-native-screens';

import { isAndroid, isIOS, searchBarAutoFocusDelayMs } from '@/config/constants';

import { SearchScopePager } from './components/SearchScopePager';
import { SearchScopeTabs } from './components/SearchScopeTabs';

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
      <KeyboardAvoidingView
        behavior="padding"
        enabled={isIOS}
        style={{ flex: 1 }}
        className="bg-background"
      >
        <SafeAreaView edges={['left', 'right']} style={{ flex: 1 }}>
          {isAndroid ? <SearchScopeTabs /> : null}
          <SearchScopePager />
          {isIOS ? (
            <View className="pb-16">
              <SearchScopeTabs />
            </View>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
      <Stack.Screen options={{ headerLargeTitle: false, title: t('navigation.search') }} />
      <Stack.SearchBar
        ref={searchBarRef}
        autoCapitalize="none"
        autoFocus
        hideNavigationBar
        hideWhenScrolling={false}
        obscureBackground={false}
        placeholder={t('navigation.search')}
        onCancelButtonPress={router.back}
        onClose={router.back}
      />
    </>
  );
}
