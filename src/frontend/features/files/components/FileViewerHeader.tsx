import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useShareFile } from '@/frontend/appShell/fileExport';
import { HeaderChrome, useRouteHeaderLeadingAction } from '@/frontend/appShell/header';
import { fileEntryPreviewKind, useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
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
  const { isSharing, share } = useShareFile(file);
  const isImage = fileEntryPreviewKind(file.entry) === 'image';

  const menuItems: MenuItem[] = [
    ...items,
    ...(!isImage
      ? [
          {
            disabled: isSharing,
            id: 'share',
            label: t('fileViewer.share'),
            onPress: () => void share(),
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
