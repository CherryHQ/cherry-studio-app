import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem, useToast } from '@cherrystudio/ui/components';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderChrome, useRouteHeaderLeadingAction } from '@/frontend/appShell/header';
import { useSaveImageToPhotos } from '@/frontend/components/ArtifactPreview';
import { fileEntryPreviewKind, useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { shareFile } from '@/frontend/utils/shareFile';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('FileViewer');
const EMPTY_ITEMS: readonly MenuItem[] = [];

export function FileViewerHeader({
  file,
  items = EMPTY_ITEMS,
}: {
  file: ResolvedFile;
  items?: readonly MenuItem[];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const leadingAction = useRouteHeaderLeadingAction();
  const { openFileEntryWithSystem } = useOpenFileEntry();
  const saveToPhotos = useSaveImageToPhotos(file.uri);
  const sharing = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const isImage = fileEntryPreviewKind(file.entry) === 'image';

  const share = async () => {
    if (sharing.current) return;
    sharing.current = true;
    setIsSharing(true);
    try {
      if (await Sharing.isAvailableAsync()) {
        await shareFile(file);
      } else {
        toast.show({ label: t('fileViewer.shareUnavailable'), variant: 'danger' });
      }
    } catch (error) {
      logger.warn('File sharing failed', error as Error, { entryId: file.entry.id });
      toast.show({ label: t('fileViewer.shareFailed'), variant: 'danger' });
    } finally {
      sharing.current = false;
      setIsSharing(false);
    }
  };

  const menuItems: MenuItem[] = [
    ...items,
    {
      disabled: isSharing,
      id: 'share',
      label: t('fileViewer.share'),
      onPress: () => void share(),
    },
    ...(isImage
      ? [
          {
            id: 'save-to-photos',
            label: t('fileViewer.saveToPhotos'),
            onPress: () => void saveToPhotos(),
          },
        ]
      : []),
    {
      id: 'open-with',
      label: t('filePreview.openWith'),
      onPress: () => void openFileEntryWithSystem(file),
    },
  ];

  return (
    <HeaderChrome
      actionTone={isImage ? 'inverse' : 'default'}
      leftActions={[leadingAction]}
      rightActions={[
        {
          accessibilityLabel: t('common.more'),
          icon: EllipsisIcon,
          items: menuItems,
          key: 'more',
          type: 'menu',
        },
      ]}
      title={file.entry.filename}
      titleAlign="center"
    />
  );
}
