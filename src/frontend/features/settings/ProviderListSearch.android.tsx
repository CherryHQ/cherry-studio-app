import { SearchField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable } from 'react-native';

import type { ProviderListSearchProps } from './providerListSearch.types';

export const providerListContentContainerStyle = undefined;

export function ProviderListSearch({
  children,
  searchText,
  setSearchText,
}: ProviderListSearchProps) {
  const { t } = useTranslation();

  return (
    <Pressable accessible={false} className="flex-1 gap-3 px-4 pb-5" onPress={Keyboard.dismiss}>
      <SearchField
        accessibilityLabel={t('navigation.search')}
        clearAccessibilityLabel={t('common.clear')}
        onChangeText={setSearchText}
        onClear={() => setSearchText('')}
        placeholder={t('navigation.search')}
        value={searchText}
      />
      {children}
    </Pressable>
  );
}
