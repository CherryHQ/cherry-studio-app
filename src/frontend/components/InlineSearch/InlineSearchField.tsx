import { SearchField } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { InlineSearchProps } from './InlineSearch.types';

/** The content-owned search row, bounded by the same frame as its results. */
export function InlineSearchField({
  layout = 'screen',
  onChangeText,
  placeholder,
  value,
}: InlineSearchProps) {
  const { t } = useTranslation();
  const clear = useCallback(() => onChangeText(''), [onChangeText]);

  return (
    <View className={layout === 'screen' ? 'px-4 pb-2' : undefined}>
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
