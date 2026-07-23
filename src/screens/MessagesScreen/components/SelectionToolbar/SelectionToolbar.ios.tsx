import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { SelectionToolbarProps } from './types';

// iOS surfaces the selection actions in the native header (right side) rather than a
// bottom toolbar. A bottom `Stack.Toolbar` is z-covered by the tab bar, so it would
// require hiding the tab bar to be visible — and toggling the native tab bar on every
// edit⇄done flashes (an interrupted SwiftUI transition) and can even freeze the scene
// under rapid toggling. Keeping the tab bar untouched and moving the actions to the
// header sidesteps both. Android keeps the bottom overlay (see the `.android` variant),
// where hiding the tab bar is an instant, safe layout change.
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
