import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchBarCommands } from 'react-native-screens';

import type { InlineSearchProps } from './InlineSearch.types';

/**
 * Keeps native search in its own row under the title, matching Android's field.
 * The shared adapter owns placement so screens use the same top search layout.
 */
export function InlineSearch({ onChangeText, placeholder, value }: InlineSearchProps) {
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
