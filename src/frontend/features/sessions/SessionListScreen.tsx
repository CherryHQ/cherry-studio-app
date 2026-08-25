import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import type { MenuItem } from '@cherrystudio/ui/components';
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

import { sessionSelectionScope } from './hooks/useSessionSelectionSource';
import { SessionList } from './SessionList';

/**
 * Full session management page (`/sessions`): the Agent Session counterpart of
 * the topic management page, minus search — the session list API has no query
 * filter yet, and content search arrives with the desktop-shaped search work.
 */
function SessionListScreenBody() {
  const { t } = useTranslation();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const handleEnterEditing = useCallback(() => {
    if (isDeletionPending) {
      return;
    }

    enterEditing();
  }, [enterEditing, isDeletionPending]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        disabled: isDeletionPending,
        id: 'select-sessions',
        label: t('session.selection.start'),
        onPress: handleEnterEditing,
      },
    ],
    [handleEnterEditing, isDeletionPending, t],
  );
  const menuActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'session-actions',
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
        key: 'finish-selecting-sessions',
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
        title={t('session.list.title')}
      />
      <View className="flex-1 bg-background">
        <SessionList />
        <SelectionControls scope={sessionSelectionScope} />
      </View>
    </>
  );
}

export function SessionListScreen() {
  return (
    <SelectionProvider>
      <SessionListScreenBody />
    </SelectionProvider>
  );
}
