import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { HeaderChrome, useRouteHeaderLeadingAction } from '@/frontend/appShell/header';
import { useSaveImageToPhotos } from '@/frontend/components/ArtifactPreview';
import {
  fileEntryPreviewKind,
  useOpenFileEntry,
  useShareFile,
} from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

const EMPTY_ITEMS: readonly MenuItem[] = [];

export function FileViewerHeader({
  file,
  items = EMPTY_ITEMS,
}: {
  file: ResolvedFile;
  items?: readonly MenuItem[];
}) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const { openFileEntryWithSystem } = useOpenFileEntry();
  const saveToPhotos = useSaveImageToPhotos(file.uri);
  const { isSharing, share } = useShareFile(file);
  const isImage = fileEntryPreviewKind(file.entry) === 'image';

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
