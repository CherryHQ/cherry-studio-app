import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { InlineSearchProps } from './InlineSearch.types';

/**
 * Mounts the list search contract as the native header search bar.
 *
 * `stacked` gives the field its own row under the title. The `integrated`
 * placement was the other candidate, but UIKit pins that one to the very end of
 * the navigation bar — outside the toolbar's own actions, so the field lands to
 * the right of a screen's overflow button and draws bare instead of picking up
 * the glass circle every other top action wears. A row of its own sidesteps the
 * ordering entirely, and it is the placement Android's field is drawn to match.
 */
export function InlineSearch({ onChangeText, placeholder, value: _value }: InlineSearchProps) {
  const { t } = useTranslation();

  return (
    <Stack.SearchBar
      autoCapitalize="none"
      // The field is the screen's only search affordance, so it stays put
      // rather than scrolling away with the list.
      hideWhenScrolling={false}
      obscureBackground={false}
      onCancelButtonPress={() => onChangeText('')}
      onChangeText={(event) => onChangeText(event.nativeEvent.text)}
      placeholder={placeholder ?? t('navigation.search')}
      placement="stacked"
    />
  );
}
