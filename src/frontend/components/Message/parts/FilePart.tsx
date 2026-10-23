import { BackgroundPressExclusion, type FilePreviewTransfer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { usePdfOcrState } from '@/frontend/hooks/file';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const { t } = useTranslation();
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;
  // A scanned PDF being read for a send or file tool shows its own recognition progress.
  const ocr = usePdfOcrState(fileEntryId);
  const recognizing = ocr?.status === 'recognizing' ? ocr : undefined;
  const transfer: FilePreviewTransfer | undefined = ocr && {
    state: 'processing',
    progress: recognizing ? recognizing.completedPages / recognizing.totalPages : 0,
    label: recognizing
      ? t('attachments.ocr.recognizingLabel', {
          completed: recognizing.completedPages,
          total: recognizing.totalPages,
        })
      : t('attachments.ocr.queuedLabel'),
  };

  return fileEntryId ? (
    <BackgroundPressExclusion>
      <FileEntryPreview
        badge={
          ocr ? (
            <Text className="font-mono text-muted-foreground text-xs" numberOfLines={1}>
              {recognizing
                ? `${recognizing.completedPages}/${recognizing.totalPages}`
                : t('attachments.ocr.queued')}
            </Text>
          ) : undefined
        }
        entryId={fileEntryId}
        transfer={transfer}
        variant="attachment"
      />
    </BackgroundPressExclusion>
  ) : null;
}
