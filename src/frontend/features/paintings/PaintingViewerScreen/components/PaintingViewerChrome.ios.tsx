import { DownloadIcon, EllipsisIcon } from '@cherrystudio/app-icons';
import type { MenuItem } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SFSymbol } from 'sf-symbols-typescript';

import {
  HeaderChrome,
  type HeaderToolbarAction,
  useRouteHeaderLeadingAction,
} from '@/frontend/components/headers';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// Native aspect-ratio glyph per ratio. iOS ships `rectangle.ratio.W.to.H`
// symbols, so the menu shows a shape that matches each option (1:1 falls back to
// `square`). Android drops SF Symbols, so its menu stays text-only by design.
const ASPECT_RATIO_ICONS: Record<string, SFSymbol> = {
  '1:1': 'square',
  '3:4': 'rectangle.ratio.3.to.4',
  '4:3': 'rectangle.ratio.4.to.3',
  '9:16': 'rectangle.ratio.9.to.16',
  '16:9': 'rectangle.ratio.16.to.9',
};

// The top actions use the app-wide white HeaderAction surface. The editing
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
        systemImage: 'message',
      },
      {
        destructive: true,
        id: 'delete',
        label: t('painting.viewer.delete'),
        onPress: onDelete,
        systemImage: 'trash',
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
      <HeaderChrome leftActions={leftActions} rightActions={rightActions} />
      <Stack.Toolbar placement="bottom">
        <Stack.Toolbar.Button
          accessibilityLabel={t('painting.viewer.edit')}
          icon="pencil"
          onPress={onEdit}
        />
        <Stack.Toolbar.Menu accessibilityLabel={t('painting.viewer.resize')} icon="aspectratio">
          {aspectRatios.map((ratio) => (
            <Stack.Toolbar.MenuAction
              icon={ASPECT_RATIO_ICONS[ratio]}
              key={ratio}
              onPress={() => onResizeSelect(ratio)}
            >
              {ratio}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Spacer />
      </Stack.Toolbar>
    </>
  );
}
