import { View } from 'react-native';

import { FileEntrySkeleton } from '@/frontend/components/FileEntryPreview';

import { fileLibraryGrid } from '../utils/constants';

/**
 * Placeholder tiles in the grid's own shape, so a page arriving swaps them for
 * files without the surrounding layout moving. Radius matches CherryUI's
 * `FilePreview` frame.
 */
export function FileLibrarySkeleton({ count, tileSize }: { count: number; tileSize: number }) {
  return (
    <View className="flex-row flex-wrap" testID="file-library-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            paddingBottom: fileLibraryGrid.tileGap,
            paddingHorizontal: fileLibraryGrid.tileGap / 2,
          }}
        >
          <FileEntrySkeleton size={tileSize} />
        </View>
      ))}
    </View>
  );
}
