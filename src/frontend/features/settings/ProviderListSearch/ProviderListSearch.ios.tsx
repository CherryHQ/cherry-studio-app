import { SearchField } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, Pressable } from 'react-native';

import type { ProviderListSearchProps } from './ProviderListSearch.types';

const usesNativeBottomSearch = Number.parseInt(String(Platform.Version), 10) >= 26;
export const providerListContentContainerStyle = usesNativeBottomSearch
  ? { paddingBottom: 96 }
  : undefined;

export function ProviderListSearch({
  children,
  searchText,
  setSearchText,
}: ProviderListSearchProps) {
  const { t } = useTranslation();
  const [isNativeSearchFocused, setIsNativeSearchFocused] = useState(false);

  return (
    <>
      {usesNativeBottomSearch ? (
        <>
          <Stack.SearchBar
            allowToolbarIntegration
            autoCapitalize="none"
            hideWhenScrolling={false}
            obscureBackground={false}
            placeholder={t('navigation.search')}
            placement="integrated"
            onBlur={() => setIsNativeSearchFocused(false)}
            onCancelButtonPress={() => {
              setIsNativeSearchFocused(false);
              setSearchText('');
            }}
            onChangeText={(event) => setSearchText(event.nativeEvent.text)}
            onFocus={() => setIsNativeSearchFocused(true)}
          />
          <Stack.Toolbar placement="bottom">
            <Stack.Toolbar.SearchBarSlot />
          </Stack.Toolbar>
        </>
      ) : null}
      <Pressable
        accessible={false}
        className="flex-1 gap-3 px-4 pb-5"
        onPress={Keyboard.dismiss}
        style={{ paddingTop: isNativeSearchFocused ? 12 : 0 }}
      >
        {usesNativeBottomSearch ? null : (
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
