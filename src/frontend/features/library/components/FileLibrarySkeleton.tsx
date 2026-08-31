import { Skeleton } from '@cherrystudio/ui/components';
import { StyleSheet, View } from 'react-native';

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
          <View className="gap-0.5 px-0.5">
            <Skeleton className="h-5 w-3/4 rounded-sm" />
            {/* The origin badge is absent on most tiles, so the placeholder
                reserves its line rather than promising one. */}
            <View style={styles.provenance} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  provenance: {
    height: fileLibraryGrid.tileProvenanceHeight,
  },
});
