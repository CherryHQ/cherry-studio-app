import { SearchField } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, Pressable } from 'react-native';

import type { ProviderListSearchProps } from './ProviderListSearch.types';

const usesNativeSearch = Number.parseInt(String(Platform.Version), 10) >= 26;
export const providerListContentContainerStyle = undefined;

export function ProviderListSearch({
  children,
  searchText,
  setSearchText,
}: ProviderListSearchProps) {
  const { t } = useTranslation();

  return (
    <>
      {usesNativeSearch ? (
        <Stack.SearchBar
          // The search field stays in the navigation bar. `false` is what keeps
          // it there: left on, UIKit hands the field to the bottom toolbar, and
          // the navigation bar visibly gains then loses a magnifier button on
          // the way in.
          allowToolbarIntegration={false}
          autoCapitalize="none"
          hideWhenScrolling={false}
          obscureBackground={false}
          placeholder={t('navigation.search')}
          placement="integrated"
          onCancelButtonPress={() => setSearchText('')}
          onChangeText={(event) => setSearchText(event.nativeEvent.text)}
        />
      ) : null}
      <Pressable accessible={false} className="flex-1 gap-3 px-4 pb-5" onPress={Keyboard.dismiss}>
        {usesNativeSearch ? null : (
          <SearchField
            accessibilityLabel={t('navigation.search')}
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={setSearchText}
            onClear={() => setSearchText('')}
            placeholder={t('navigation.search')}
            value={searchText}
          />
        )}
        {children}
      </Pressable>
    </>
  );
}
