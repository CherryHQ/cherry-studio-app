import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ModelSearchField } from '../ModelSearchField/ModelSearchField';
import type { ModelSearchFieldProps } from '../ModelSearchField/ModelSearchField.types';

type ModelSearchControlsProps = ModelSearchFieldProps & {
  children: ReactNode;
};

export function ModelSearchControls({
  children,
  placeholder,
  searchText,
  setSearchText,
}: ModelSearchControlsProps) {
  return (
    <View className="gap-3 px-4 py-3">
      <ModelSearchField
        placeholder={placeholder}
        searchText={searchText}
        setSearchText={setSearchText}
      />
      {children}
    </View>
  );
}
