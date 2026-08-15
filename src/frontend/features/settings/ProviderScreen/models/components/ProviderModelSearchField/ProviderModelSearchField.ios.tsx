import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ProviderModelSearchFieldProps } from './ProviderModelSearchField.types';

export function ProviderModelSearchField({ setSearchText }: ProviderModelSearchFieldProps) {
  const { t } = useTranslation();

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
