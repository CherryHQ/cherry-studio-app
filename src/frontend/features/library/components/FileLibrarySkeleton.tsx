import { View } from 'react-native';

import { FileLibraryRowSkeleton } from './FileLibraryRow';

export function FileLibrarySkeleton({ count }: { count: number }) {
  return (
    <View testID="file-library-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <FileLibraryRowSkeleton key={index} />
      ))}
    </View>
  );
}
