import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchBarCommands } from 'react-native-screens';

import { useIsFormContentConstrained } from '@/frontend/appShell/layout';

import type { InlineSearchProps } from './InlineSearch.types';
import { InlineSearchField } from './InlineSearchField';

export function InlineSearch(props: InlineSearchProps) {
  const isFormContentConstrained = useIsFormContentConstrained();

  // Native header search spans the window, outside the form's width constraint.
  return isFormContentConstrained ? (
    <InlineSearchField {...props} />
  ) : (
    <NativeInlineSearch {...props} />
  );
}

function NativeInlineSearch({ onChangeText, placeholder, value }: InlineSearchProps) {
  const { t } = useTranslation();
  const searchBarRef = useRef<SearchBarCommands | null>(null);
  const nativeValueRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const searchBar = searchBarRef.current;

    if (!searchBar || nativeValueRef.current === value) {
      return;
    }

    nativeValueRef.current = value;
    searchBar.setText(value);
  }, [value]);

  return (
    <Stack.SearchBar
      allowToolbarIntegration={false}
      autoCapitalize="none"
      // The field is the screen's only search affordance, so it stays put
      // rather than scrolling away with the list.
      hideWhenScrolling={false}
      obscureBackground={false}
      onCancelButtonPress={() => {
        nativeValueRef.current = '';
        onChangeText('');
      }}
      onChangeText={(event) => {
        const nextValue = event.nativeEvent.text;

        nativeValueRef.current = nextValue;
        onChangeText(nextValue);
      }}
      placeholder={placeholder ?? t('navigation.search')}
      placement="stacked"
      ref={searchBarRef}
    />
  );
}
