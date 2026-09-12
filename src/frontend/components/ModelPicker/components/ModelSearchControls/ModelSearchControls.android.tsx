import type { ReactNode } from 'react';
import { View } from 'react-native';

import { InlineSearch, type InlineSearchProps } from '@/frontend/components/InlineSearch';

type ModelSearchControlsProps = Omit<InlineSearchProps, 'layout'> & {
  children: ReactNode;
};

export function ModelSearchControls({
  children,
  onChangeText,
  placeholder,
  value,
}: ModelSearchControlsProps) {
  return (
    <View className="gap-3 px-4 py-3">
      <InlineSearch
        layout="embedded"
        onChangeText={onChangeText}
        placeholder={placeholder}
        value={value}
      />
      {children}
    </View>
  );
}
