import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { SelectionToolbarProps } from './types';

// Native bottom toolbar, matching the Android bar's select-all + delete pair.
// Bottom placement keeps the header free for the screen's Edit/Done toggle.
export function SelectionToolbar({
  isDeleting,
  onDelete,
  onToggleAll,
  selectedCount,
}: SelectionToolbarProps) {
  const { t } = useTranslation();
  const selectionLabel =
    selectedCount === 0
      ? t('common.selection.selectAll')
      : t('common.selection.count', { count: selectedCount });

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        accessibilityLabel={selectionLabel}
        disabled={isDeleting}
        onPress={onToggleAll}
      >
        {selectionLabel}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Button
        accessibilityLabel={t('common.delete')}
        disabled={selectedCount === 0 || isDeleting}
        onPress={onDelete}
        tintColor={Color.ios.systemRed}
      >
        {t('common.delete')}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
