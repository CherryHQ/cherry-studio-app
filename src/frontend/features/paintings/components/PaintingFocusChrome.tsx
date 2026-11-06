import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import PresentationIcon from '@cherrystudio/app-icons/icons/presentation';
import type { MenuItem } from '@cherrystudio/ui/components';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useSaveImageToPhotos } from '@/frontend/appShell/fileExport';
import {
  HeaderChrome,
  type HeaderToolbarAction,
  useRouteHeaderLeadingAction,
} from '@/frontend/appShell/header';
import { useShareFile, useShareFiles } from '@/frontend/appShell/sharing';
import { useResolvedFile } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';

import type { PaintingBoardImage } from '../hooks/usePaintingBoard';

/**
 * Focus chrome: back returns to wherever the board was opened from, the board
 * pill opens the overview, and the focused image's actions share one menu
 * on the right.
 */
export function PaintingFocusChrome({
  boardTitle,
  image,
  onBack,
  onDelete,
  onOpenOverview,
  onShowInfo,
  groupFileEntryIds,
  onSelectImages,
}: {
  boardTitle: string;
  image: PaintingBoardImage | undefined;
  onBack: () => void;
  onDelete?: () => void;
  onOpenOverview?: () => void;
  onShowInfo?: () => void;
  groupFileEntryIds?: readonly string[];
  onSelectImages?: () => void;
}) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction(onBack);
  const file = useResolvedFile(image?.fileEntryId as FileEntryId | undefined);
  const { isSharing, share } = useShareFile(file.data);
  const { share: shareGroup, isSharing: isSharingGroup } = useShareFiles();
  const save = useSaveImageToPhotos(
    {
      provenance: file.data?.entry.provenance,
      uri: image?.uri ?? '',
    },
    { watermark: 'none' },
  );

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (image) {
      items.push({
        id: 'save',
        group: 'sharing',
        label: t('painting.focus.save'),
        onPress: () => void save(),
      });
      items.push({
        disabled: !file.data || isSharing,
        id: 'share',
        group: 'sharing',
        label: t('painting.focus.share'),
        onPress: () => void share(),
      });
      if (groupFileEntryIds && groupFileEntryIds.length > 1)
        items.push({
          id: 'share-group',
          group: 'sharing',
          label: t('sharing.imageGroup'),
          disabled: isSharing || isSharingGroup,
          onPress: () => void shareGroup(groupFileEntryIds),
        });
    }
    if (onSelectImages)
      items.push({
        id: 'select-images',
        group: 'sharing',
        label: t('sharing.selectImages'),
        disabled: isSharing || isSharingGroup,
        onPress: onSelectImages,
      });
    if (onShowInfo) {
      items.push({
        id: 'info',
        label: t('painting.focus.info.title'),
        onPress: onShowInfo,
      });
    }

    if (onDelete) {
      items.push({
        destructive: true,
        id: 'delete',
        label: t('painting.focus.delete'),
        onPress: onDelete,
      });
    }
    return items;
  }, [
    file.data,
    shareGroup,
    isSharingGroup,
    groupFileEntryIds,
    image,
    isSharing,
    onDelete,
    onSelectImages,
    onShowInfo,
    save,
    share,
    t,
  ]);

  const rightActions = useMemo<HeaderToolbarAction[]>(() => {
    const actions: HeaderToolbarAction[] = [];
    if (menuItems.length > 0) {
      actions.push({
        accessibilityLabel: t('painting.focus.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'more',
        nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
        type: 'menu',
      });
    }
    return actions;
  }, [menuItems, t]);
  const leftActions = useMemo(() => (leadingAction ? [leadingAction] : []), [leadingAction]);

  return (
    <HeaderChrome
      leftActions={leftActions}
      rightActions={rightActions}
      titleAlign="left"
      titleElement={
        <View className="max-w-56 items-start">
          <Pressable
            accessibilityLabel={t('painting.focus.openBoard', { title: boardTitle })}
            accessibilityRole="button"
            className="max-w-full flex-row items-center gap-1.5 rounded-full bg-card/95 px-3.5 py-2 active:opacity-70"
            disabled={!onOpenOverview}
            onPress={onOpenOverview}
          >
            <PresentationIcon className="size-4 shrink-0 text-card-foreground" />
            <Text
              className="min-w-0 shrink font-semibold text-card-foreground text-sm"
              numberOfLines={1}
            >
              {boardTitle}
            </Text>
          </Pressable>
        </View>
      }
    />
  );
}
