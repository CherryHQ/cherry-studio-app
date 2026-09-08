import UploadIcon from '@cherrystudio/app-icons/icons/upload';
import { BottomSheet, Button, ContentState, SelectionIndicator } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import {
  type ComposerAttachmentReady,
  isComposerAttachmentReady,
  isComposerImageMediaType,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { FileEntrySkeleton, LoadedFileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { type ResolvedFileEntry, useFileEntryPages } from '@/frontend/hooks/file';
import type { FileEntryId } from '@/shared/data/types/file';

const PREVIEW_SIZE = 48;

type FilePickerBottomSheetProps = {
  onClose: () => void;
  onUpload: () => void;
};

type FilePickerListExtraData = {
  attachedIds: ReadonlySet<FileEntryId>;
  dateFormatter: Intl.DateTimeFormat;
  onToggle: (id: FileEntryId) => void;
  selectedIds: ReadonlySet<FileEntryId>;
};

/** A fresh selection per opening, committed to the composer only by Add. */
export function FilePickerBottomSheet({ onClose, onUpload }: FilePickerBottomSheetProps) {
  const { t, i18n } = useTranslation();
  const { attachments } = useComposerState();
  const { addAttachments } = useComposerActions();
  const { entries, error, isLoading, isLoadingMore, loadNext, refresh } = useFileEntryPages({
    enabled: true,
  });
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<FileEntryId>>(() => new Set());
  const attachedIds = new Set(
    attachments.flatMap((attachment) =>
      isComposerAttachmentReady(attachment) ? [attachment.fileEntryId] : [],
    ),
  );
  const selectedAttachments = entries.flatMap((item) => {
    if (!selectedIds.has(item.entry.id) || attachedIds.has(item.entry.id)) return [];
    const attachment = toLibraryAttachment(item);
    return attachment ? [attachment] : [];
  });
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  function toggleFile(id: FileEntryId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelectedFiles() {
    if (selectedAttachments.length === 0) return;
    addAttachments(selectedAttachments);
    onClose();
  }

  const listExtraData: FilePickerListExtraData = {
    attachedIds,
    dateFormatter,
    onToggle: toggleFile,
    selectedIds,
  };
  const errorState = (
    <ContentState.Error
      primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
      title={t('chat.filePicker.loadFailed')}
    />
  );

  return (
    <BottomSheet
      closeAction={{ accessibilityLabel: t('common.close') }}
      headerAction={
        selectedAttachments.length > 0 ? (
          <Button
            accessibilityLabel={t('chat.filePicker.addSelected', {
              count: selectedAttachments.length,
            })}
            onPress={addSelectedFiles}
            size="sm"
            testID="file-picker-add"
            variant="ghost"
          >
            {t('chat.filePicker.add')}
          </Button>
        ) : undefined
      }
      onClose={onClose}
      open
      size="full"
      testID="file-picker"
      title={t('chat.filePicker.title')}
    >
      <View className="px-5">
        <Pressable
          accessibilityRole="button"
          className="min-h-16 flex-row items-center gap-4 py-4 active:opacity-60"
          onPress={onUpload}
          testID="file-picker-upload"
        >
          <UploadIcon className="size-6 text-foreground" />
          <Text className="min-w-0 flex-1 text-lg text-foreground">
            {t('chat.filePicker.upload')}
          </Text>
        </Pressable>
        <View className="h-px bg-border" />
        <View className="pt-4 pb-2">
          <Text accessibilityRole="header" className="text-base font-medium text-foreground">
            {t('chat.filePicker.recent')}
          </Text>
        </View>
      </View>
      {entries.length === 0 ? (
        <View className="flex-1 justify-center px-5 pb-8">
          {error ? (
            errorState
          ) : isLoading ? (
            <ContentState.Loading title={t('chat.filePicker.loading')} />
          ) : (
            <ContentState.Empty title={t('library.empty')} />
          )}
        </View>
      ) : (
        <LegendList
          contentContainerStyle={styles.listContent}
          data={entries}
          estimatedItemSize={88}
          extraData={listExtraData}
          keyExtractor={fileEntryKeyExtractor}
          ListFooterComponent={
            error ? (
              <View className="py-4">{errorState}</View>
            ) : isLoadingMore ? (
              <View className="py-4">
                <ContentState.Loading title={t('chat.filePicker.loading')} />
              </View>
            ) : null
          }
          nestedScrollEnabled
          onEndReached={() => {
            if (!error) void loadNext();
          }}
          onEndReachedThreshold={0.5}
          recycleItems
          renderItem={renderFileRow}
          style={styles.list}
          testID="file-picker-list"
        />
      )}
    </BottomSheet>
  );
}

function fileEntryKeyExtractor(item: ResolvedFileEntry) {
  return item.entry.id;
}

function renderFileRow({ extraData, item }: LegendListRenderItemProps<ResolvedFileEntry>) {
  const { attachedIds, dateFormatter, onToggle, selectedIds } =
    extraData as FilePickerListExtraData;

  return (
    <FilePickerRow
      isAttached={attachedIds.has(item.entry.id)}
      isSelected={selectedIds.has(item.entry.id)}
      item={item}
      modifiedDate={dateFormatter.format(item.entry.updatedAt)}
      onToggle={onToggle}
    />
  );
}

function FilePickerRow({
  isAttached,
  isSelected,
  item,
  modifiedDate,
  onToggle,
}: {
  isAttached: boolean;
  isSelected: boolean;
  item: ResolvedFileEntry;
  modifiedDate: string;
  onToggle: (id: FileEntryId) => void;
}) {
  const { t } = useTranslation();
  const isDisabled = isAttached || !item.uri;
  const description = !item.uri
    ? t('filePreview.unavailable')
    : isAttached
      ? t('chat.filePicker.alreadyAdded')
      : t('chat.filePicker.modifiedAt', { date: modifiedDate });

  return (
    <Pressable
      accessibilityLabel={`${item.entry.filename}, ${description}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isAttached || isSelected, disabled: isDisabled }}
      className="min-h-18 flex-row items-center gap-4 py-3 active:opacity-60"
      disabled={isDisabled}
      onPress={() => onToggle(item.entry.id)}
      testID={`file-picker-entry-${item.entry.id}`}
    >
      {/* Selection owns the whole row, including the thumbnail. Do not open a
          nested file viewer or expose a second accessibility press target. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {item.uri && isComposerImageMediaType(item.entry.mediaType) && !item.previewUri ? (
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
          {item.entry.filename}
        </Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
      <SelectionIndicator disabled={isDisabled} selected={isAttached || isSelected} />
    </Pressable>
  );
}

function toLibraryAttachment({ entry, uri }: ResolvedFileEntry): ComposerAttachmentReady | null {
  return uri
    ? {
        fileEntryId: entry.id,
        id: `file-entry:${entry.id}`,
        kind: isComposerImageMediaType(entry.mediaType) ? 'image' : 'file',
        mediaType: entry.mediaType,
        name: entry.filename,
        size: entry.size,
        status: 'ready',
        uri,
      }
    : null;
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: 16, paddingHorizontal: 20 },
});
