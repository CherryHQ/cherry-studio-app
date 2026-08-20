import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { McpServerChromeProps } from './McpServerChrome.types';

export function McpServerChrome({
  isDisabled,
  isEnabled,
  onDelete,
  onToggleEnabled,
}: McpServerChromeProps) {
  const { t } = useTranslation();
  const toggleLabel = t(isEnabled ? 'settings.mcp.disableServer' : 'settings.mcp.enableServer');

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        accessibilityLabel={toggleLabel}
        disabled={isDisabled}
        icon={isEnabled ? 'pause' : 'play'}
        onPress={onToggleEnabled}
      />
      <Stack.Toolbar.Button
        accessibilityLabel={t('settings.mcp.deleteServer')}
        disabled={isDisabled}
        icon="trash"
        onPress={onDelete}
        tintColor={Color.ios.systemRed}
      />
      <Stack.Toolbar.Spacer />
    </Stack.Toolbar>
  );
}
