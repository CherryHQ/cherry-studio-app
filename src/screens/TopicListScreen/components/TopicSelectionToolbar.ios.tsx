import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { TopicSelectionToolbarProps } from './TopicSelectionToolbar.types';

export function TopicSelectionToolbar({
  isDeleting,
  onDelete,
  onToggleAll,
  selectedCount,
}: TopicSelectionToolbarProps) {
  const { t } = useTranslation();
  const selectionLabel =
    selectedCount === 0
      ? t('topic.selection.selectAll')
      : t('topic.selection.count', { count: selectedCount });

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        accessibilityLabel={selectionLabel}
        disabled={isDeleting}
        onPress={onToggleAll}
        separateBackground
      >
        {selectionLabel}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Button
        accessibilityLabel={t('common.delete')}
        disabled={selectedCount === 0 || isDeleting}
        onPress={onDelete}
        separateBackground
        tintColor={Color.ios.systemRed}
      >
        {t('common.delete')}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
