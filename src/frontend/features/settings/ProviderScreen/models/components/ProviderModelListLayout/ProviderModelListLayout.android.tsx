import { View } from 'react-native';

import { ModelSearchField } from '@/frontend/components/modelPicker';

import { ProviderModelListContent } from '../ProviderModelListContent';
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
            <ModelSearchField searchText={searchText} setSearchText={setSearchText} />
          </View>
        ) : undefined
      }
    />
  );
}
