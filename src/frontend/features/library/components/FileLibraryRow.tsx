import { SelectionIndicator, Skeleton } from '@cherrystudio/ui/components';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fileEntryPreviewKind,
  FileEntrySkeleton,
  LoadedFileEntryPreview,
} from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { LibraryFile } from '@/shared/data/types/fileLibrary';

import type { FileLibraryEntry } from '../hooks/useFileEntries';

const PREVIEW_SIZE = 40;

// Rows grow with wrapped filenames and the user's text size; this is only a list estimate.
export const FILE_LIBRARY_ROW_ESTIMATED_SIZE = 88;

export const FileLibraryRow = memo(function FileLibraryRow({
  isEditing,
  isSelected,
  item,
  modifiedDate,
  location,
  onOpen,
  onManage,
  onToggle,
}: {
  isEditing: boolean;
  isSelected: boolean;
  item: FileLibraryEntry;
  modifiedDate: string;
  location?: string;
  onOpen: (file: ResolvedFile) => void;
  onManage: (file: LibraryFile) => void;
  onToggle: (fileEntryId: string) => void;
}) {
  const { t } = useTranslation();
  const description = !item.uri
    ? t('filePreview.unavailable')
    : location
      ? t('library.locationAndDate', { location, date: modifiedDate })
      : t('library.modifiedAt', { date: modifiedDate });

  function manage() {
    if (!isEditing && item.libraryFile) onManage(item.libraryFile);
  }

  // Opening, context actions, and selection retain one press target while drags
  // yield to the result list. Selection is entered from the page's More menu.
  return (
    <Pressable
      accessibilityActions={
        isEditing
          ? undefined
          : [
              {
                name: 'longpress',
                label: t('library.manage', { name: item.libraryFile?.name ?? item.entry.filename }),
              },
            ]
      }
      accessibilityLabel={`${item.libraryFile?.name ?? item.entry.filename}, ${description}`}
      accessibilityRole={isEditing ? 'checkbox' : 'button'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="min-h-18 flex-row items-center gap-4 py-3 active:opacity-60"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') {
          manage();
        }
      }}
      onLongPress={manage}
      onPress={() => {
        if (isEditing) {
          onToggle(item.entry.id);
        } else if (item.uri) {
          onOpen({ entry: item.entry, uri: item.uri });
        }
      }}
      testID={`file-library-entry-${item.entry.id}`}
    >
      {/* The row owns opening. Keep its thumbnail out of touch and accessibility
          handling so a tap opens once and a drag yields to the parent list. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {item.uri && fileEntryPreviewKind(item.entry) === 'image' && !item.previewUri ? (
          <FileEntrySkeleton size={PREVIEW_SIZE} variant="icon" />
        ) : (
          <LoadedFileEntryPreview
            entry={item.entry}
            previewUri={item.previewUri}
            size={PREVIEW_SIZE}
            uri={item.uri}
            variant="icon"
          />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base text-foreground" numberOfLines={2}>
          {item.libraryFile?.name ?? item.entry.filename}
        </Text>
        <Text className="text-sm text-muted-foreground" ellipsizeMode="middle" numberOfLines={1}>
          {description}
        </Text>
      </View>
      {isEditing ? <SelectionIndicator selected={isSelected} /> : null}
    </Pressable>
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
