import { Skeleton } from '@cherrystudio/ui/components';
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
          className="gap-2"
          key={index}
          style={{
            paddingBottom: fileLibraryGrid.tileGap,
            paddingHorizontal: fileLibraryGrid.tileGap / 2,
          }}
        >
          <FileEntrySkeleton size={tileSize} />
          <View className="gap-1 px-0.5">
            <Skeleton className="h-4 w-3/4 rounded-sm" />
            <Skeleton className="h-3 w-1/2 rounded-sm" />
          </View>
        </View>
      ))}
    </View>
  );
}
