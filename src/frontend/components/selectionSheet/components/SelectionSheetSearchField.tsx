import { SearchField } from 'heroui-native/search-field';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

type SelectionSheetSearchFieldProps = {
  onChange: (value: string) => void;
  value: string;
};

export function SelectionSheetSearchField({ onChange, value }: SelectionSheetSearchFieldProps) {
  const { t } = useTranslation();

  return (
    <SearchField className="w-full" onChange={onChange} value={value}>
      <SearchField.Group className="h-10 rounded-xl bg-settings-grouped-surface">
        <SearchField.SearchIcon iconProps={{ size: 18 }} />
        <SearchField.Input
          accessibilityLabel={t('navigation.search')}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          className="h-10 min-h-10 rounded-xl border-0 bg-transparent py-0 pl-9 pr-10 text-base"
          placeholder={t('navigation.search')}
          returnKeyType="search"
          spellCheck={false}
          style={styles.searchInput}
          textContentType="none"
        />
        <SearchField.ClearButton accessibilityLabel={t('common.clear')} className="right-1" />
      </SearchField.Group>
    </SearchField>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});
