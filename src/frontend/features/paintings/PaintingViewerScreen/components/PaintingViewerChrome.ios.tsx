import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import type { MenuItem } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  HeaderChrome,
  type HeaderToolbarAction,
  useRouteHeaderLeadingAction,
} from '@/frontend/components/headers';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// The top actions use the app-wide HeaderAction contract with an inverse tint. The editing
// actions stay in the native iOS bottom toolbar, which is a different control
// region. Rendered from the screen so placement="bottom" is allowed.
export function PaintingViewerChrome({
  aspectRatios,
  onDelete,
  onDownload,
  onEdit,
  onResizeSelect,
  onViewConversation,
}: PaintingViewerChromeProps) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const overflowMenuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'view-conversation',
        label: t('painting.viewer.viewConversation'),
        onPress: onViewConversation,
      },
      {
        destructive: true,
        id: 'delete',
        label: t('painting.viewer.delete'),
        onPress: onDelete,
      },
    ],
    [onDelete, onViewConversation, t],
  );
  const leftActions = useMemo<HeaderToolbarAction[]>(() => [leadingAction], [leadingAction]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('painting.viewer.download'),
        icon: DownloadIcon,
        key: 'download',
        onPress: onDownload,
        type: 'icon',
      },
      {
        accessibilityLabel: t('painting.viewer.more'),
        icon: EllipsisIcon,
        items: overflowMenuItems,
        key: 'more',
        type: 'menu',
      },
    ],
    [onDownload, overflowMenuItems, t],
  );

  return (
    <>
      <HeaderChrome actionTone="inverse" leftActions={leftActions} rightActions={rightActions} />
      <Stack.Toolbar placement="bottom">
        <Stack.Toolbar.Button accessibilityLabel={t('painting.viewer.edit')} onPress={onEdit}>
          {t('painting.viewer.edit')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Menu accessibilityLabel={t('painting.viewer.resize')}>
          <Stack.Toolbar.Label>{t('painting.viewer.resize')}</Stack.Toolbar.Label>
          {aspectRatios.map((ratio) => (
            <Stack.Toolbar.MenuAction key={ratio} onPress={() => onResizeSelect(ratio)}>
              {ratio}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Spacer />
      </Stack.Toolbar>
    </>
  );
}
