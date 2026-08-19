import { Keyboard, Pressable } from 'react-native';

import { ModelSearchField } from '@/frontend/components/modelPicker';

import type { ProviderListSearchProps } from './ProviderListSearch.types';

export const providerListContentContainerStyle = undefined;

export function ProviderListSearch({
  children,
  searchText,
  setSearchText,
}: ProviderListSearchProps) {
  return (
    <Pressable accessible={false} className="flex-1 gap-3 px-4 pb-5" onPress={Keyboard.dismiss}>
      <ModelSearchField searchText={searchText} setSearchText={setSearchText} />
      {children}
    </Pressable>
  );
}
