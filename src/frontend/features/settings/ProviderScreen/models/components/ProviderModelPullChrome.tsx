import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export function ProviderModelPullChrome({
  isApplying,
  onApply,
  selectedCount,
}: {
  isApplying: boolean;
  onApply: () => void;
  selectedCount: number;
}) {
  const { t } = useTranslation();
  const selectionLabel = t('common.selection.count', { count: selectedCount });
  const applyLabel = t(
    selectedCount === 0
      ? 'settings.provider.models.pullApply'
      : 'settings.provider.models.pullApplySelected',
    { count: selectedCount },
  );

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Button accessibilityLabel={selectionLabel} disabled>
        {selectionLabel}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Button
        accessibilityLabel={applyLabel}
        disabled={selectedCount === 0 || isApplying}
        onPress={onApply}
        variant="prominent"
      >
        {applyLabel}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
