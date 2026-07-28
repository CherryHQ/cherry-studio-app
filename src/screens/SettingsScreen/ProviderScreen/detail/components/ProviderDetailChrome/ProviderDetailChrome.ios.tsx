import { Color, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ProviderDetailChromeProps } from './ProviderDetailChrome.types';

export function ProviderDetailChrome({
  canDelete,
  checkAction,
  isActive,
  isDisabled,
  onDelete,
  onToggleActive,
  pullAction,
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
      {pullAction ? (
        <Stack.Toolbar.Button
          accessibilityLabel={t('settings.provider.models.pull')}
          // A bottom toolbar button has no busy state, so an in-flight pull reads
          // as disabled rather than spinning.
          disabled={pullAction.isDisabled || pullAction.isLoading}
          icon="arrow.trianglehead.2.clockwise.rotate.90"
          onPress={pullAction.onPress}
        />
      ) : null}
      <Stack.Toolbar.Spacer />
      {checkAction ? (
        <Stack.Toolbar.Button
          accessibilityLabel={t('settings.provider.models.check')}
          disabled={checkAction.isDisabled || checkAction.isLoading}
          icon="waveform.path.ecg"
          onPress={checkAction.onPress}
        />
      ) : null}
    </Stack.Toolbar>
  );
}
