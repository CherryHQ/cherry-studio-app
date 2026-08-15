import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { AssistantListSearchBarProps } from './assistantListSearchBar.types';

export function AssistantListSearchBar({ isEditing, setSearchText }: AssistantListSearchBarProps) {
  const { t } = useTranslation();

  return isEditing ? null : (
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
