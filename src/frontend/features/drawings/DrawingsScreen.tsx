import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';

import { DrawingList } from './components/DrawingList';

const paintingSelectionScope = 'drawings';

/**
 * Drawings history (`/drawings`), the sidebar's drawings destination: the
 * gallery grid plus multi-select batch deletion. Back exits selection before
 * leaving this root-stack page.
 * Creating and editing paintings stays on the root stack's `/paintings`, which
 * `DrawingList` pushes itself.
 */
function DrawingsScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const openNewPainting = useCallback(() => {
    router.push('/paintings');
  }, [router]);
  const createActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('painting.history.createNew'),
        icon: PlusIcon,
        key: 'create-painting',
        onPress: openNewPainting,
        testID: 'painting-history-create-header',
        type: 'icon',
      },
    ],
    [openNewPainting, t],
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
        onBack={isEditing ? exitEditing : undefined}
        rightActions={isEditing ? doneActions : createActions}
        title={t('painting.history.title')}
      />
      <View className="flex-1">
        <DrawingList />
        <SelectionControls scope={paintingSelectionScope} />
      </View>
    </>
  );
}

export function DrawingsScreen() {
  return (
    <SelectionProvider>
      <DrawingsScreenBody />
    </SelectionProvider>
  );
}
