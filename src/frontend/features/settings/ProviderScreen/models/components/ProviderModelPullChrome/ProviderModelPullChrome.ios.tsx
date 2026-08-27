import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ProviderModelPullChromeProps } from './ProviderModelPullChrome.types';

export function ProviderModelPullChrome({
  isAllSelected,
  isApplying,
  isSelectionScoped,
  isToggleAllDisabled,
  onApply,
  onToggleAll,
  selectedCount,
}: ProviderModelPullChromeProps) {
  const { t } = useTranslation();
  const toggleAllLabel = t(
    isSelectionScoped
      ? isAllSelected
        ? 'settings.provider.models.selection.deselectVisible'
        : 'settings.provider.models.selection.selectVisible'
      : isAllSelected
        ? 'settings.provider.models.selection.deselectAll'
        : 'settings.provider.models.selection.selectAll',
  );

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button disabled={isApplying || isToggleAllDisabled} onPress={onToggleAll}>
        {toggleAllLabel}
      </Stack.Toolbar.Button>
      {/* Pushes the confirm to the trailing edge, where a commit belongs. */}
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Button
        disabled={selectedCount === 0 || isApplying}
        onPress={onApply}
        variant="prominent"
      >
        {selectedCount === 0
          ? t('settings.provider.models.pullApply')
          : t('settings.provider.models.pullApplySelected', { count: selectedCount })}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
