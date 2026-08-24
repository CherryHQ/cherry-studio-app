import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ModelSearchField } from '../ModelSearchField/ModelSearchField';
import type { ModelSearchFieldProps } from '../ModelSearchField/ModelSearchField.types';

type ModelSearchControlsProps = ModelSearchFieldProps & {
  children: ReactNode;
};

export function ModelSearchControls({
  children,
  searchText,
  setSearchText,
}: ModelSearchControlsProps) {
  return (
    <>
      <ModelSearchField searchText={searchText} setSearchText={setSearchText} />
      <View className="gap-3 px-4 pb-3">{children}</View>
    </>
  );
}
