import {
  ContextMenu,
  FileBrowserRow,
  type MenuItem,
  SelectionIndicator,
  Skeleton,
} from '@cherrystudio/ui/components';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  fileEntryPreviewKind,
  FileEntrySkeleton,
  LoadedFileEntryPreview,
} from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

import type { FileLibraryEntry } from '../hooks/useFileEntries';

const PREVIEW_SIZE = 40;

// Names stay on one line; rows still grow with the user's text size, so this is only an estimate.
export const FILE_LIBRARY_ROW_ESTIMATED_SIZE = 72;

export const FileLibraryRow = memo(function FileLibraryRow({
  isEditing,
  isSelected,
  item,
  modifiedDate,
  location,
  menuItems,
  onOpen,
  onToggle,
}: {
  isEditing: boolean;
  isSelected: boolean;
  item: FileLibraryEntry;
  modifiedDate: string;
  location?: string;
  menuItems: readonly MenuItem[];
  onOpen: (file: ResolvedFile) => void;
  onToggle: (fileEntryId: string) => void;
}) {
  const { t } = useTranslation();
  const description = !item.uri
    ? t('filePreview.unavailable')
    : location
      ? t('library.locationAndDate', { location, date: modifiedDate })
      : t('library.modifiedAt', { date: modifiedDate });

  // Opening and selection retain one press target while drags yield to the
  // result list. Long press opens the row's menu, which also offers selection.
  return (
    <ContextMenu items={menuItems}>
      <FileBrowserRow
        accessibilityLabel={`${item.libraryFile?.name ?? item.entry.filename}, ${description}`}
        accessibilityRole={isEditing ? 'checkbox' : 'button'}
        accessibilityState={isEditing ? { checked: isSelected } : undefined}
        description={description}
        name={item.libraryFile?.name ?? item.entry.filename}
        onPress={() => {
          if (isEditing) {
            onToggle(item.entry.id);
          } else if (item.uri) {
            onOpen({ entry: item.entry, uri: item.uri });
          }
        }}
        testID={`file-library-entry-${item.entry.id}`}
        preview={
          item.uri && fileEntryPreviewKind(item.entry) === 'image' && !item.previewUri ? (
            <FileEntrySkeleton size={PREVIEW_SIZE} variant="icon" />
          ) : (
            <LoadedFileEntryPreview
              entry={item.entry}
              previewUri={item.previewUri}
              size={PREVIEW_SIZE}
              uri={item.uri}
              variant="icon"
            />
          )
        }
      >
        {isEditing ? <SelectionIndicator selected={isSelected} /> : null}
      </FileBrowserRow>
    </ContextMenu>
  );
});

export function FileLibraryRowSkeleton() {
  return (
    <View className="min-h-18 flex-row items-center gap-4 py-3">
      <FileEntrySkeleton size={PREVIEW_SIZE} variant="icon" />
      <View className="min-w-0 flex-1 gap-2">
        <Skeleton className="h-5 w-3/4 rounded-sm" />
        <Skeleton className="h-4 w-2/5 rounded-sm" />
      </View>
    </View>
  );
}
