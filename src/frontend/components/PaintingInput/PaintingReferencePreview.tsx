import { FilePreview } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { filenameExtension } from '@/shared/data/types/file';

/** Presentational preview: its caller owns file resolution and navigation across the portal. */
export function PaintingReferencePreview({
  image,
  onPress,
}: {
  image: { fileEntryId?: string; uri?: string; name: string };
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const metadata = {
    displayName: image.name,
    extensionLabel: filenameExtension(image.name)?.slice(0, 5).toUpperCase() ?? '',
    kind: 'image',
  };
  return (
    <FilePreview
      disabled={!image.fileEntryId || !image.uri}
      file={
        image.fileEntryId && image.uri
          ? {
              ...metadata,
              id: image.fileEntryId,
              revision: image.uri,
              uri: image.uri,
            }
          : null
      }
      metadata={metadata}
      labels={{ openWith: t('filePreview.openWith'), unavailable: t('filePreview.unavailable') }}
      onPress={onPress}
      variant="attachment"
    />
  );
}
