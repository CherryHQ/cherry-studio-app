import { BackgroundPressExclusion, type FilePreviewTransfer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { useFileOcrState } from '@/frontend/hooks/file';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const { t } = useTranslation();
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;
  // Recognition belongs to this file, independently of other sends or file tools.
  const ocr = useFileOcrState(fileEntryId);
  const recognizing = ocr?.status === 'recognizing' ? ocr : undefined;
  const transfer: FilePreviewTransfer | undefined = ocr && {
    state: 'processing',
    progress:
      recognizing?.kind === 'image'
        ? undefined
        : recognizing
          ? recognizing.completedPages / recognizing.totalPages
          : 0,
    label: recognizing
      ? recognizing.kind === 'image'
        ? t('attachments.ocr.recognizingImage')
        : t('attachments.ocr.recognizingLabel', {
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
            <Text
              // Fixed-width page counts do not shift as recognition advances.
              className={`${recognizing?.kind === 'image' ? '' : 'font-mono '}text-muted-foreground text-xs`}
              numberOfLines={1}
            >
              {recognizing
                ? recognizing.kind === 'image'
                  ? t('attachments.ocr.recognizingImage')
                  : `${recognizing.completedPages}/${recognizing.totalPages}`
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
