import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ProviderDetailChromeProps } from './ProviderDetailChrome.types';

export function ProviderDetailChrome({
  canDelete,
  isActive,
  isDisabled,
  onDelete,
  onToggleActive,
}: ProviderDetailChromeProps) {
  const { t } = useTranslation();
  const toggleLabel = t(
    isActive ? 'settings.provider.disableProvider' : 'settings.provider.enableProvider',
  );

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button
        accessibilityLabel={toggleLabel}
        disabled={isDisabled}
        icon={isActive ? 'pause' : 'play'}
        onPress={onToggleActive}
      />
      {canDelete ? (
        <Stack.Toolbar.Button
          accessibilityLabel={t('settings.provider.deleteProvider')}
          disabled={isDisabled}
          icon="trash"
          onPress={onDelete}
          tintColor={Color.ios.systemRed}
        />
      ) : null}
      <Stack.Toolbar.Spacer />
    </Stack.Toolbar>
  );
}
