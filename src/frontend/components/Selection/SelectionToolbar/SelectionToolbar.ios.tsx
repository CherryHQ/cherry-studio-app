import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { usePaneChrome } from '@/frontend/appShell/layout';

import { InlineSelectionToolbar } from './InlineSelectionToolbar';
import type { SelectionToolbarProps } from './types';

// Native bottom toolbar, matching the Android bar's selection and file actions.
// The header owns the selected count and exit; this bar owns batch actions.
// A pane has no native-stack screen to host the toolbar, so it draws the app's own bar.
export function SelectionToolbar(props: SelectionToolbarProps) {
  return usePaneChrome() ? (
    <InlineSelectionToolbar {...props} />
  ) : (
    <NativeSelectionToolbar {...props} />
  );
}

function NativeSelectionToolbar({
  actions,
  allSelected,
  isPending,
  onDelete,
  onToggleAll,
  selectedCount,
  selectableCount,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const selectionLabel = t(
    allSelected ? 'common.selection.deselectAll' : 'common.selection.selectAll',
  );

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        accessibilityLabel={selectionLabel}
        disabled={isPending || selectableCount === 0}
        onPress={onToggleAll}
      >
        {selectionLabel}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      {actions?.map((action) => (
        <Stack.Toolbar.Button
          accessibilityLabel={action.label}
          disabled={selectedCount === 0 || isPending || action.disabled}
          key={action.id}
          onPress={action.onPress}
        >
          {action.label}
        </Stack.Toolbar.Button>
      ))}
      <Stack.Toolbar.Button
        accessibilityLabel={t('common.delete')}
        disabled={selectedCount === 0 || isPending}
        onPress={onDelete}
        tintColor={Color.ios.systemRed}
      >
        {t('common.delete')}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
