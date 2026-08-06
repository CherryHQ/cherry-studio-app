import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { WebSearchProviderChromeProps } from './WebSearchProviderChrome.types';

export function WebSearchProviderChrome({ onCheck }: WebSearchProviderChromeProps) {
  const { t } = useTranslation();

  return (
    <Stack.Toolbar placement="bottom">
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Button
        accessibilityLabel={t('settings.websearch.provider.check')}
        icon="waveform.path.ecg"
        onPress={onCheck}
      />
    </Stack.Toolbar>
  );
}
