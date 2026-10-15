import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import type { MenuItem } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { useSaveImageToPhotos, useShareFile } from '@/frontend/appShell/fileExport';
import {
  HeaderChrome,
  type HeaderToolbarAction,
  useRouteHeaderLeadingAction,
} from '@/frontend/appShell/header';
import { useResolvedFile } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';

import type { PaintingBoardImage } from '../hooks/usePaintingBoard';

export type PaintingResizeChoice = {
  paramValues: Record<string, unknown>;
  pixels?: string;
  ratio: string;
};

/**
 * Focus chrome: back returns to wherever the board was opened from, the board
 * pill opens the overview, and the focused image's actions sit on the right —
 * save directly, everything else in one menu.
 */
export function PaintingFocusChrome({
  boardTitle,
  image,
  onBack,
  onDelete,
  onOpenOverview,
  onResize,
  onShowInfo,
  resizeChoices,
}: {
  boardTitle: string;
  image: PaintingBoardImage | undefined;
  onBack: () => void;
  onDelete?: () => void;
  onOpenOverview?: () => void;
  onResize: (choice: PaintingResizeChoice) => void;
  onShowInfo?: () => void;
  resizeChoices: readonly PaintingResizeChoice[];
}) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction(onBack);
  const file = useResolvedFile(image?.fileEntryId as FileEntryId | undefined);
  const { isSharing, share } = useShareFile(file.data);
  const save = useSaveImageToPhotos({
    provenance: file.data?.entry.provenance,
    uri: image?.uri ?? '',
  });

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (image) {
      items.push({
        disabled: !file.data || isSharing,
        group: 'share',
        id: 'share',
        label: t('painting.focus.share'),
        onPress: () => void share(),
      });
    }
    for (const choice of resizeChoices) {
      items.push({
        group: 'resize',
        id: `resize:${choice.ratio}`,
        label: choice.pixels
          ? t('painting.focus.resizeToPixels', { pixels: choice.pixels, ratio: choice.ratio })
          : t('painting.focus.resizeTo', { ratio: choice.ratio }),
        onPress: () => onResize(choice),
      });
    }
    if (onShowInfo) {
      items.push({
        group: 'info',
        id: 'info',
        label: t('painting.focus.info.title'),
        onPress: onShowInfo,
      });
    }
    if (onDelete) {
      items.push({
        destructive: true,
        group: 'delete',
        id: 'delete',
        label: t('painting.focus.delete'),
        onPress: onDelete,
      });
    }
    return items;
  }, [file.data, image, isSharing, onDelete, onResize, onShowInfo, resizeChoices, share, t]);

  const rightActions = useMemo<HeaderToolbarAction[]>(() => {
    const actions: HeaderToolbarAction[] = [];
    if (image) {
      actions.push({
        accessibilityLabel: t('painting.focus.save'),
        icon: DownloadIcon,
        key: 'save',
        onPress: () => void save(),
        type: 'icon',
      });
    }
    if (menuItems.length > 0) {
      actions.push({
        accessibilityLabel: t('painting.focus.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'more',
        type: 'menu',
      });
    }
    return actions;
  }, [image, menuItems, save, t]);
  const leftActions = useMemo(() => [leadingAction], [leadingAction]);

  return (
    <HeaderChrome
      actionTone="inverse"
      leftActions={leftActions}
      rightActions={rightActions}
      titleElement={
        <Pressable
          accessibilityLabel={t('painting.focus.openBoard', { title: boardTitle })}
          accessibilityRole="button"
          className="max-w-56 flex-row items-center gap-1.5 rounded-full bg-constant-white/15 px-3.5 py-2 active:opacity-70"
          disabled={!onOpenOverview}
          onPress={onOpenOverview}
        >
          <NetworkIcon className="size-4 text-constant-white" />
          <Text
            className="min-w-0 shrink font-semibold text-constant-white text-sm"
            numberOfLines={1}
          >
            {boardTitle}
          </Text>
        </Pressable>
      }
    />
  );
}
