import UploadIcon from '@cherrystudio/app-icons/icons/upload';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import {
  type ComposerAttachmentReady,
  createReadyAttachmentDraft,
  isComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import type { ResolvedFileEntry } from '@/frontend/hooks/file';
import type { FileEntryId } from '@/shared/data/types/file';

import { FilePickerList } from './FilePickerList';

type FilePickerBottomSheetProps = {
  onClose: () => void;
  onUpload: () => void;
};

/** Selection belongs to the sheet, so collapsing or recycling a folder never drops its files. */
export function FilePickerBottomSheet({ onClose, onUpload }: FilePickerBottomSheetProps) {
  const { t } = useTranslation();
  const { attachments } = useComposerState();
  const { addAttachments } = useComposerActions();
  const [selection, setSelection] = useState<ReadonlyMap<FileEntryId, ComposerAttachmentReady>>(
    () => new Map(),
  );
  const attachedIds = new Set(
    attachments.flatMap((attachment) =>
      isComposerAttachmentReady(attachment) ? [attachment.fileEntryId] : [],
    ),
  );
  const selectedAttachments = [...selection.values()].filter(
    (attachment) => !attachedIds.has(attachment.fileEntryId),
  );
  const selectedIds = new Set(selection.keys());

  function toggleFile({ entry, uri }: ResolvedFileEntry) {
    if (!uri || attachedIds.has(entry.id)) return;
    const attachment = createReadyAttachmentDraft({ entry, uri }, `file-entry:${entry.id}`);
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.set(entry.id, attachment);
      return next;
    });
  }

  function addSelectedFiles() {
    if (selectedAttachments.length === 0) return;
    addAttachments(selectedAttachments);
    onClose();
  }

  return (
    <BottomSheet
      footer={
        selectedAttachments.length > 0 ? (
          <Button onPress={addSelectedFiles} testID="file-picker-add">
            {t('chat.filePicker.addSelected', { count: selectedAttachments.length })}
          </Button>
        ) : undefined
      }
      onClose={onClose}
      open
      size="full"
      testID="file-picker"
      title={t('chat.filePicker.title')}
      titleAlign="center"
    >
      <View className="px-5">
        <Pressable
          accessibilityRole="button"
          className="min-h-14 flex-row items-center gap-4 py-2 active:opacity-60"
          onPress={onUpload}
          testID="file-picker-upload"
        >
          {/* Same width as list previews, so the label shares the filename column. */}
          <View className="size-10 items-center justify-center">
            <UploadIcon className="size-6 text-foreground" />
          </View>
          <Text className="min-w-0 flex-1 text-base text-foreground">
            {t('chat.filePicker.upload')}
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          className="pt-4 pb-1 text-sm font-medium text-muted-foreground"
        >
          {t('chat.filePicker.recent')}
        </Text>
      </View>
      <FilePickerList attachedIds={attachedIds} onToggle={toggleFile} selectedIds={selectedIds} />
    </BottomSheet>
  );
}
