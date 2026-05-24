import { SearchField } from 'heroui-native/search-field';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

export function ProviderModelSearchField({
  searchText,
  setSearchText,
}: {
  searchText: string;
  setSearchText: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <SearchField className="w-full" onChange={setSearchText} value={searchText}>
      <SearchField.Group className="h-10">
        <SearchField.SearchIcon iconProps={{ size: 18 }} />
        <SearchField.Input
          accessibilityLabel={t('navigation.search')}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          className="h-10 min-h-10 rounded-3xl border-0 py-0 pl-9 pr-10 text-base leading-5"
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
    textAlignVertical: 'center',
  },
});
