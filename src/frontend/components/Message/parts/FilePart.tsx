import { BackgroundPressExclusion, type FilePreviewTransfer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { useAudioTranscriptionActivity, useFileOcrState } from '@/frontend/hooks/file';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const { t, i18n } = useTranslation();
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;
  const transcription = useAudioTranscriptionActivity(fileEntryId);
  const audioProgress = transcription?.progress;
  const fraction =
    audioProgress && audioProgress.totalSeconds > 0
      ? Math.min(1, audioProgress.completedSeconds / audioProgress.totalSeconds)
      : undefined;
  const transcriptionLabel =
    fraction === undefined
      ? t('attachments.audio.transcribing')
      : fraction.toLocaleString(i18n.resolvedLanguage, {
          style: 'percent',
          maximumFractionDigits: 0,
        });
  // Recognition belongs to this file, independently of other sends or file tools.
  const ocr = useFileOcrState(fileEntryId);
  const recognizing = ocr?.status === 'recognizing' ? ocr : undefined;
  const transfer: FilePreviewTransfer | undefined = transcription
    ? {
        state: 'processing',
        progress: fraction,
        label: t('attachments.audio.transcribing'),
      }
    : ocr && {
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
          transcription ? (
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {transcriptionLabel}
            </Text>
          ) : ocr ? (
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
