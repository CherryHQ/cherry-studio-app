import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SearchBarCommands } from 'react-native-screens';

import { searchBarAutoFocusDelayMs } from '@/frontend/utils/constants';

import { SearchScopeTabs } from '../components/SearchScopeTabs';
import type { GlobalSearchChromeProps } from './GlobalSearchChrome.types';

export function GlobalSearchChrome({ children }: GlobalSearchChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchBarRef = useRef<SearchBarCommands>(null);
  const tabBarHeight = useBottomTabBarHeight();

  // UISearchController attaches to the navigation bar asynchronously, so its
  // imperative focus must wait until the focused screen has mounted.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => searchBarRef.current?.focus(), searchBarAutoFocusDelayMs);
      return () => clearTimeout(timer);
    }, []),
  );

  return (
    <>
      <KeyboardAvoidingView
        behavior="padding"
        enabled
        style={{ flex: 1 }}
        className="bg-background"
      >
        <SafeAreaView edges={['left', 'right']} style={{ flex: 1 }}>
          {children}
          <View style={{ paddingBottom: tabBarHeight }}>
            <SearchScopeTabs />
          </View>
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
