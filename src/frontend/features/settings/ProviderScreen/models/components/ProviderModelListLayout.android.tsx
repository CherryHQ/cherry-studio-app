import { View } from 'react-native';

import { ProviderModelListContent } from './ProviderModelListContent';
import type { ProviderModelListLayoutProps } from './providerModelListLayout.types';
import { ProviderModelSearchField } from './ProviderModelSearchField';

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
