import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useOpenDrawer } from '@/frontend/components/headers';
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
  const openDrawer = useOpenDrawer();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLargeTitle: false,
          title: t('painting.history.title'),
        }}
      />
      <View className="flex-1 bg-background">
        <DrawingList />
        <SelectionControls scope={paintingSelectionScope} />
      </View>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.openMenu')}
          icon="line.3.horizontal"
          onPress={openDrawer}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t(isEditing ? 'common.done' : 'common.edit')}
          disabled={isDeletionPending}
          onPress={isEditing ? exitEditing : enterEditing}
        >
          {t(isEditing ? 'common.done' : 'common.edit')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
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
