import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { SelectionToolbarProps } from './types';

export function SelectionToolbar({ isDeleting, onDelete, selectedCount }: SelectionToolbarProps) {
  const { t } = useTranslation();

  return (
    <Stack.Toolbar placement="right">
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
