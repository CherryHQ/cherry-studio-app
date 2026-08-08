import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useToast } from 'heroui-native/toast';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { FallbackPreview } from './components/FallbackPreview/FallbackPreview';
import { FilePreviewLoading } from './components/FallbackPreview/FilePreviewLoading';
import { FilePreviewUnavailable } from './components/FallbackPreview/FilePreviewUnavailable';
import { FilePreviewFrame } from './components/FilePreviewFrame/FilePreviewFrame';
import { ImagePreview } from './components/ImagePreview/ImagePreview';
import type { FilePreviewProps } from './FilePreview.types';
import { useResolvedFile } from './hooks/useResolvedFile';
import { fileEntryDisplayName } from './utils/fileEntryPresentation';
import { resolveFilePreviewKind } from './utils/filePreviewRegistry';

const defaultSize = 112;
const logger = loggerService.withContext('FilePreview');

export function FilePreview({ entryId, size = defaultSize }: FilePreviewProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useResolvedFile(entryId);
  const resolvedSize = Math.max(1, size);
  const entry = data?.entry;
  const previewKind = entry ? resolveFilePreviewKind(entry.ext) : 'fallback';
  const accessibilityLabel = entry ? fileEntryDisplayName(entry) : t('filePreview.unavailable');
  const handlePress = () => {
    if (!data) {
      return;
    }
    void ExpoQuickLook.previewFile({
      chooserTitle: t('filePreview.openWith'),
      uri: data.uri,
    }).catch((error) => {
      logger.warn('Failed to open file preview', toError(error), { entryId });
      toast.show({ label: t('filePreview.openFailed'), variant: 'danger' });
    });
  };

  return (
    <FilePreviewFrame
      accessibilityLabel={accessibilityLabel}
      disabled={!data}
      onPress={handlePress}
      size={resolvedSize}
    >
      {isLoading ? (
        <FilePreviewLoading label={t('filePreview.loading')} size={resolvedSize} />
      ) : !data || !entry ? (
        <FilePreviewUnavailable label={t('filePreview.unavailable')} size={resolvedSize} />
      ) : previewKind === 'image' ? (
        <ImagePreview entry={entry} uri={data.uri} />
      ) : (
        <FallbackPreview entry={entry} size={resolvedSize} />
      )}
    </FilePreviewFrame>
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
