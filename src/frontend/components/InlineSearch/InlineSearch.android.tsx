import { SearchField } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { InlineSearchProps } from './InlineSearch.types';

/**
 * Draws the list search contract as a row between the header and the list.
 *
 * `Stack.SearchBar` works on Android too, but it arrives as an `androidx`
 * `SearchView` mounted as a toolbar menu item: collapsed to an icon pinned
 * right of the screen's own actions, expanding to cover the whole toolbar, and
 * styled by the platform theme rather than by CherryUI. Drawing the field here
 * instead puts it where iOS puts its `stacked` bar and keeps it looking like
 * the rest of the app.
 */
export function InlineSearch({ onChangeText, placeholder, value }: InlineSearchProps) {
  const { t } = useTranslation();
  const clear = useCallback(() => onChangeText(''), [onChangeText]);

  return (
    <View className="px-4 pb-2">
      <SearchField
        accessibilityLabel={t('navigation.search')}
        clearAccessibilityLabel={t('common.clear')}
        onChangeText={onChangeText}
        onClear={clear}
        placeholder={placeholder ?? t('navigation.search')}
        value={value}
      />
    </View>
  );
}
