import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ModelSearchFieldProps } from './ModelSearchField.types';

export function ModelSearchField({ placeholder, setSearchText }: ModelSearchFieldProps) {
  const { t } = useTranslation();

  return (
    <Stack.SearchBar
      autoCapitalize="none"
      hideNavigationBar={false}
      hideWhenScrolling={false}
      obscureBackground={false}
      placeholder={placeholder ?? t('navigation.search')}
      placement="stacked"
      onCancelButtonPress={() => setSearchText('')}
      onChangeText={(event) => setSearchText(event.nativeEvent.text)}
    />
  );
}
