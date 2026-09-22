import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { useStartupReadyAfterFrames } from '@/frontend/appShell/startup';

export function RestoreRestartScreen() {
  const { t } = useTranslation();
  const reportReady = useStartupReadyAfterFrames();
  return (
    <View
      className="flex-1 items-center justify-center gap-4 bg-background px-8"
      accessibilityLiveRegion="polite"
      onLayout={reportReady}
    >
      <Text className="text-center text-xl font-semibold text-foreground">
        {t('backup.restart.title')}
      </Text>
      <Text className="text-center text-base text-muted-foreground">
        {t(Platform.OS === 'android' ? 'backup.restart.android' : 'backup.restart.description')}
      </Text>
    </View>
  );
}
