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
        onPress={onToggleEnabled}
      >
        {toggleLabel}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Button
        accessibilityLabel={t('settings.mcp.deleteServer')}
        disabled={isDisabled}
        onPress={onDelete}
        tintColor={Color.ios.systemRed}
      >
        {t('settings.mcp.deleteServer')}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
    </Stack.Toolbar>
  );
}
