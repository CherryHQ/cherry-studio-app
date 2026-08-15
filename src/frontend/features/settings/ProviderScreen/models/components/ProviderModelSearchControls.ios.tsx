import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ProviderModelSearchField } from './ProviderModelSearchField';
import type { ProviderModelSearchFieldProps } from './providerModelSearchField.types';

type ProviderModelSearchControlsProps = ProviderModelSearchFieldProps & {
  children: ReactNode;
};

export function ProviderModelSearchControls({
  children,
  searchText,
  setSearchText,
}: ProviderModelSearchControlsProps) {
  return (
    <>
      <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
      <View className="gap-3 px-4 pb-3">{children}</View>
    </>
  );
}
