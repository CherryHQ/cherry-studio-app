import { SearchField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { ModelSearchFieldProps } from './ModelSearchField.types';

export function ModelSearchField({
  placeholder,
  searchText,
  setSearchText,
}: ModelSearchFieldProps) {
  const { t } = useTranslation();

  return (
    <SearchField
      accessibilityLabel={t('navigation.search')}
      clearAccessibilityLabel={t('common.clear')}
      onChangeText={setSearchText}
      onClear={() => setSearchText('')}
      placeholder={placeholder ?? t('navigation.search')}
      value={searchText}
    />
  );
}
