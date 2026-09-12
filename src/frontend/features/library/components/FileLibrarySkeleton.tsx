import { View } from 'react-native';

import { FileEntrySkeleton } from '@/frontend/components/FileEntryPreview';

import { fileLibraryGrid, type FileLibraryViewMode } from '../utils/constants';
import { FileLibraryRowSkeleton } from './FileLibraryRow';

/**
 * Loading placeholders follow the selected view's geometry and preview shape.
 */
export function FileLibrarySkeleton({
  count,
  tileSize,
  viewMode,
}: {
  count: number;
  tileSize: number;
  viewMode: FileLibraryViewMode;
}) {
  if (viewMode === 'list') {
    return (
      <View
        style={{ paddingHorizontal: fileLibraryGrid.tileGap / 2 }}
        testID="file-library-skeleton"
      >
        {Array.from({ length: count }, (_, index) => (
          <FileLibraryRowSkeleton key={index} />
        ))}
      </View>
    );
  }

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
          <FileEntrySkeleton size={tileSize} variant="card" />
        </View>
      ))}
    </View>
  );
}
