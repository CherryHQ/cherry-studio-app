import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ProviderDetailChromeProps } from './ProviderDetailChrome.types';
import { PullSpinner } from './PullSpinner';

export function ProviderDetailChrome({
  editAction,
  pullAction,
  selection,
}: ProviderDetailChromeProps) {
  const { t } = useTranslation();

  if (selection) {
    return (
      <Stack.Toolbar placement="bottom">
        <Stack.Toolbar.Button onPress={selection.onToggleAll}>
          {t(
            selection.isAllSelected
              ? 'settings.provider.models.selection.deselectAll'
              : 'settings.provider.models.selection.selectAll',
          )}
        </Stack.Toolbar.Button>
        {/* Holds it against the leading edge; a lone button gets centred. */}
        <Stack.Toolbar.Spacer />
      </Stack.Toolbar>
    );
  }

  // Nothing to put in the bar: the configuration tab's own actions are the
  // switch in the banner and the delete button on the settings screen.
  if (!pullAction && !editAction) {
    return null;
  }

  return (
    <Stack.Toolbar placement="bottom">
      {pullAction ? (
        pullAction.isLoading ? (
          // A native bar button item cannot animate its SF Symbol, so an in-flight
          // pull swaps in a custom view that can. It is inert by design — the
          // button it replaces would have been disabled anyway.
          <Stack.Toolbar.View>
            <View
              accessible
              accessibilityLabel={t('settings.provider.models.pull')}
              accessibilityState={{ busy: true }}
              className="size-6"
            >
              <PullSpinner className="size-6 text-foreground" />
            </View>
          </Stack.Toolbar.View>
        ) : (
          <Stack.Toolbar.Button
            accessibilityLabel={t('settings.provider.models.pull')}
            disabled={pullAction.isDisabled}
            icon="arrow.trianglehead.2.clockwise.rotate.90"
            onPress={pullAction.onPress}
          />
        )
      ) : null}
      {editAction ? (
        <Stack.Toolbar.Button
          accessibilityLabel={t('settings.provider.models.selection.start')}
          disabled={editAction.isDisabled}
          icon="checklist"
          onPress={editAction.onPress}
        />
      ) : null}
      {/* Holds the actions against the leading edge. Without it a lone toggle
          button gets centred by the native toolbar. */}
      <Stack.Toolbar.Spacer />
    </Stack.Toolbar>
  );
}
