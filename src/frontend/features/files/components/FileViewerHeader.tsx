import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { HeaderChrome, useRouteHeaderLeadingAction } from '@/frontend/appShell/header';
import { useShareFile } from '@/frontend/appShell/sharing';
import { useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
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

  const menuItems: MenuItem[] = [
    ...items,
    {
      disabled: isSharing,
      id: 'share',
      group: 'sharing',
      label: t('fileViewer.share'),
      onPress: () => void share(),
    },
    {
      id: 'open-with',
      label: t('filePreview.openWith'),
      onPress: () => void openFileEntryWithSystem(file),
    },
  ];

  return (
    <HeaderChrome
      leftActions={leadingAction ? [leadingAction] : []}
      rightActions={[
        {
          accessibilityLabel: t('common.more'),
          icon: EllipsisIcon,
          items: menuItems,
          key: 'more',
          nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
          type: 'menu',
        },
      ]}
      title={file.entry.filename}
      titleAlign="center"
    />
  );
}
