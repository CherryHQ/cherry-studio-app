import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import ProportionsIcon from '@cherrystudio/app-icons/icons/proportions';
import { ActionMenu, type MenuItem } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HeaderChrome,
  HeaderIconButton,
  type HeaderToolbarAction,
  useRouteHeaderLeadingAction,
} from '@/frontend/components/headers';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// Android has no native bottom-header slot. The top row uses the shared
// HeaderChrome, while the bottom actions remain a custom overlay bar matching
// SelectionToolbar.
export function PaintingViewerChrome({
  aspectRatios,
  onDelete,
  onDownload,
  onEdit,
  onResizeSelect,
  onViewConversation,
}: PaintingViewerChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
  const resizeMenuItems = useMemo<readonly MenuItem[]>(
    () =>
      aspectRatios.map((ratio) => ({
        id: ratio,
        label: ratio,
        onPress: () => onResizeSelect(ratio),
      })),
    [aspectRatios, onResizeSelect],
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
      <View
        className="absolute inset-x-0 flex-row items-center justify-start gap-2 pl-2"
        pointerEvents="box-none"
        style={[styles.bottomBar, { bottom: Math.max(insets.bottom, 12) + 12 }]}
      >
        <HeaderIconButton
          accessibilityLabel={t('painting.viewer.edit')}
          className="size-9 bg-transparent"
          onPress={onEdit}
        >
          <PencilIcon className="size-6 text-constant-white" />
        </HeaderIconButton>
        <ActionMenu items={resizeMenuItems}>
          <View
            accessibilityLabel={t('painting.viewer.resize')}
            accessibilityRole="button"
            className="size-9 items-center justify-center"
          >
            <ProportionsIcon className="size-6 text-constant-white" />
          </View>
        </ActionMenu>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    zIndex: 20,
  },
});
