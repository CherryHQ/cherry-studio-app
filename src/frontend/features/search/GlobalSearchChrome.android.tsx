import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchScopeTabs } from './components/SearchScopeTabs';
import type { GlobalSearchChromeProps } from './globalSearchChrome.types';

export function GlobalSearchChrome({ children }: GlobalSearchChromeProps) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <>
      <KeyboardAvoidingView
        behavior="padding"
        enabled={false}
        style={{ flex: 1 }}
        className="bg-background"
      >
        <SafeAreaView edges={['left', 'right']} style={{ flex: 1 }}>
          <SearchScopeTabs />
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
      <Stack.Screen options={{ headerLargeTitle: false, title: t('navigation.search') }} />
      <Stack.SearchBar
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
