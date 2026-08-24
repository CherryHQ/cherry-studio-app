import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';

import { DrawingList } from './DrawingList';

const paintingSelectionScope = 'drawings';

/**
 * Drawings history (`/drawings`), the sidebar's drawings destination: the
 * gallery grid plus multi-select batch deletion. It is a drawer scene, not a
 * pushed page, so it leads with a hamburger and has nothing to go back to.
 * Creating and editing paintings stays on the root stack's `/paintings`, which
 * `DrawingList` pushes itself.
 */
function PaintingHistoryScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const openNewPainting = useCallback(() => {
    router.push('/paintings');
  }, [router]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'create-painting',
        label: t('painting.history.createNew'),
        onPress: openNewPainting,
      },
      {
        disabled: isDeletionPending,
        id: 'select-paintings',
        label: t('painting.selection.start'),
        onPress: enterEditing,
      },
    ],
    [enterEditing, isDeletionPending, openNewPainting, t],
  );
  const menuActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'painting-actions',
        type: 'menu',
      },
    ],
    [menuItems, t],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        disabled: isDeletionPending,
        key: 'finish-selecting-paintings',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, isDeletionPending, t],
  );

  return (
    <>
      <RouteHeader
        rightActions={isEditing ? doneActions : menuActions}
        title={t('painting.history.title')}
      />
      <View className="flex-1 bg-background">
        <DrawingList />
        <SelectionControls scope={paintingSelectionScope} />
      </View>
    </>
  );
}

export function PaintingHistoryScreen() {
  return (
    <SelectionProvider>
      <PaintingHistoryScreenBody />
    </SelectionProvider>
  );
}
