import { SearchField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { ProviderModelSearchFieldProps } from './ProviderModelSearchField.types';

export function ProviderModelSearchField({
  searchText,
  setSearchText,
}: ProviderModelSearchFieldProps) {
  const { t } = useTranslation();

  return (
    <SearchField
      accessibilityLabel={t('navigation.search')}
      clearAccessibilityLabel={t('common.clear')}
      onChangeText={setSearchText}
      onClear={() => setSearchText('')}
      placeholder={t('navigation.search')}
      value={searchText}
    />
  );
}
