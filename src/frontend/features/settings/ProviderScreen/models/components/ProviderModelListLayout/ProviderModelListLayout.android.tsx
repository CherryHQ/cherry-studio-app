import { View } from 'react-native';

import { ProviderModelListContent } from '../ProviderModelListContent';
import { ProviderModelSearchField } from '../ProviderModelSearchField/ProviderModelSearchField';
import type { ProviderModelListLayoutProps } from './ProviderModelListLayout.types';

export function ProviderModelListLayout({
  searchText,
  setSearchText,
  showSearch,
  ...listProps
}: ProviderModelListLayoutProps) {
  return (
    <ProviderModelListContent
      {...listProps}
      ListHeaderComponent={
        showSearch ? (
          <View className="px-4 py-3">
            <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
          </View>
        ) : undefined
      }
    />
  );
}
