import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { FileTile, ImageTile } from '../../mediaTile';
import { useFilePartUri } from '../hooks/useFilePartUri';

const logger = loggerService.withContext('FilePart');

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const { t } = useTranslation();
  const { isLoading, uri } = useFilePartUri(part);
  const name = part.filename ?? part.mediaType;
  const handlePreview = () => {
    if (!uri) {
      return;
    }
    void ExpoQuickLook.previewFile({ editingMode: 'disabled', uri }).catch((error) => {
      logger.warn('Failed to preview message attachment', toError(error));
    });
  };

  if (part.mediaType.startsWith('image/') && uri) {
    return <ImageTile accessibilityLabel={name} onPress={handlePreview} uri={uri} />;
  }

  const isUnavailable = !isLoading && !uri;
  return (
    <FileTile
      accessibilityLabel={isUnavailable ? t('chat.media.fileUnavailable', { name }) : name}
      accessibilityState={isUnavailable ? { disabled: true } : undefined}
      className={!uri ? 'opacity-60' : undefined}
      name={name}
      onPress={uri ? handlePreview : undefined}
      statusLabel={isUnavailable ? t('chat.media.unavailable') : undefined}
    />
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
