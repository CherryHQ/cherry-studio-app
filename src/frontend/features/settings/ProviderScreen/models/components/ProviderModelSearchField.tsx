import { SearchField } from '@cherrystudio/ui';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export function ProviderModelSearchField({
  searchText,
  setSearchText,
}: {
  searchText: string;
  setSearchText: (value: string) => void;
}) {
  const { t } = useTranslation();

  if (process.env.EXPO_OS === 'ios') {
    return (
      <Stack.SearchBar
        autoCapitalize="none"
        hideNavigationBar={false}
        hideWhenScrolling={false}
        obscureBackground={false}
        placeholder={t('navigation.search')}
        placement="stacked"
        onCancelButtonPress={() => setSearchText('')}
        onChangeText={(event) => setSearchText(event.nativeEvent.text)}
      />
    );
  }

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
