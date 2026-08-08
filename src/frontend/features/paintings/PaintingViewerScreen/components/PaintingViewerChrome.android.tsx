import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import { Stack } from 'expo-router';
import { DownloadIcon, EllipsisIcon, PencilIcon, ProportionsIcon, XIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/frontend/components/headers/components/HeaderIconButton';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// Android has no native bottom-header slot, so the top row goes through the
// transparent Stack header (headerLeft/headerRight) and the bottom actions are a
// custom overlay bar, mirroring SelectionToolbar.android. Menus use the
// platform MenuView, matching MainHeader.android.
export function PaintingViewerChrome({
  aspectRatios,
  onClose,
  onDelete,
  onDownload,
  onEdit,
  onResizeSelect,
  onViewConversation,
}: PaintingViewerChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const moreActions = useMemo<MenuAction[]>(
    () => [
      {
        id: 'view-conversation',
        image: require('../../../../../../assets/navigation/messages.png'),
        title: t('painting.viewer.viewConversation'),
      },
      {
        attributes: { destructive: true },
        id: 'delete',
        image: 'trash',
        title: t('painting.viewer.delete'),
      },
    ],
    [t],
  );
  const handleMoreAction = useCallback(
    (event: NativeActionEvent) => {
      if (event.nativeEvent.event === 'view-conversation') {
        onViewConversation();
        return;
      }
      if (event.nativeEvent.event === 'delete') {
        onDelete();
      }
    },
    [onDelete, onViewConversation],
  );

  const resizeActions = useMemo<MenuAction[]>(
    () => aspectRatios.map((ratio) => ({ id: ratio, title: ratio })),
    [aspectRatios],
  );
  const handleResizeAction = useCallback(
    (event: NativeActionEvent) => onResizeSelect(event.nativeEvent.event),
    [onResizeSelect],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderIconButton accessibilityLabel={t('painting.viewer.close')} onPress={onClose}>
              <XIcon className="size-6 text-constant-white" strokeWidth={2} />
            </HeaderIconButton>
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-1">
              <HeaderIconButton
                accessibilityLabel={t('painting.viewer.download')}
                onPress={onDownload}
              >
                <DownloadIcon className="size-6 text-constant-white" strokeWidth={2} />
              </HeaderIconButton>
              <MenuView actions={moreActions} onPressAction={handleMoreAction}>
                <View
                  accessibilityLabel={t('painting.viewer.more')}
                  accessibilityRole="button"
                  className="size-9 items-center justify-center"
                >
                  <EllipsisIcon className="size-6 text-constant-white" strokeWidth={2} />
                </View>
              </MenuView>
            </View>
          ),
        }}
      />
      <View
        className="absolute inset-x-0 flex-row items-center justify-start gap-2 pl-2"
        pointerEvents="box-none"
        style={[styles.bottomBar, { bottom: Math.max(insets.bottom, 12) + 12 }]}
      >
        <HeaderIconButton accessibilityLabel={t('painting.viewer.edit')} onPress={onEdit}>
          <PencilIcon className="size-6 text-constant-white" strokeWidth={2} />
        </HeaderIconButton>
        <MenuView actions={resizeActions} onPressAction={handleResizeAction}>
          <View
            accessibilityLabel={t('painting.viewer.resize')}
            accessibilityRole="button"
            className="size-9 items-center justify-center"
          >
            <ProportionsIcon className="size-6 text-constant-white" strokeWidth={2} />
          </View>
        </MenuView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    zIndex: 20,
  },
});
