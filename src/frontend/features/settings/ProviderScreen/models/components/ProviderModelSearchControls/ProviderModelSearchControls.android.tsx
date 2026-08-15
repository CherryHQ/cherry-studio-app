import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ProviderModelSearchField } from '../ProviderModelSearchField/ProviderModelSearchField';
import type { ProviderModelSearchFieldProps } from '../ProviderModelSearchField/ProviderModelSearchField.types';

type ProviderModelSearchControlsProps = ProviderModelSearchFieldProps & {
  children: ReactNode;
};

export function ProviderModelSearchControls({
  children,
  searchText,
  setSearchText,
}: ProviderModelSearchControlsProps) {
  return (
    <View className="gap-3 px-4 py-3">
      <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
      {children}
    </View>
  );
}
