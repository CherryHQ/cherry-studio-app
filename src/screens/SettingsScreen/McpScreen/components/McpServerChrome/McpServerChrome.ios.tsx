import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { McpServerChromeProps } from './McpServerChrome.types';

export function McpServerChrome({
  isActive,
  isDeleting,
  isUpdating,
  onDelete,
  onToggleActive,
}: McpServerChromeProps) {
  const { t } = useTranslation();
  const toggleLabel = t(isActive ? 'settings.mcp.disableServer' : 'settings.mcp.enableServer');

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        accessibilityLabel={toggleLabel}
        disabled={isDeleting || isUpdating}
        icon={isActive ? 'pause' : 'play'}
        onPress={onToggleActive}
      />
      <Stack.Toolbar.Button
        accessibilityLabel={t('settings.mcp.deleteServer')}
        disabled={isDeleting || isUpdating}
        icon="trash"
        onPress={onDelete}
        tintColor={Color.ios.systemRed}
      />
      <Stack.Toolbar.Spacer />
    </Stack.Toolbar>
  );
}
