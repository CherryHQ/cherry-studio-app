import { SearchField } from '@cherrystudio/ui';
import { useTranslation } from 'react-i18next';

type SelectionSheetSearchFieldProps = {
  onChange: (value: string) => void;
  value: string;
};

export function SelectionSheetSearchField({ onChange, value }: SelectionSheetSearchFieldProps) {
  const { t } = useTranslation();

  return (
    <SearchField
      accessibilityLabel={t('navigation.search')}
      clearAccessibilityLabel={t('common.clear')}
      onChangeText={onChange}
      onClear={() => onChange('')}
      placeholder={t('navigation.search')}
      value={value}
    />
  );
}
