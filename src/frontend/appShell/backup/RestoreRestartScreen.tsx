import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { useStartupReadyAfterFrames } from '@/frontend/appShell/startup';

import { getBackupStorage } from '../../../../modules/backup-storage';

const RESTART_FALLBACK_MS = 5000;

export function RestoreRestartScreen() {
  const { t } = useTranslation();
  const reportReady = useStartupReadyAfterFrames();
  const [native] = useState(() => (Platform.OS === 'android' ? getBackupStorage() : null));
  const [showManual, setShowManual] = useState(!native?.restartAfterRestore);
  const requested = useRef(false);

  useEffect(() => {
    if (!native?.restartAfterRestore) return;
    const fallback = setTimeout(() => setShowManual(true), RESTART_FALLBACK_MS);
    if (!requested.current) {
      requested.current = true;
      void native.restartAfterRestore().catch(() => setShowManual(true));
    }
    return () => clearTimeout(fallback);
  }, [native]);

  return (
    <View
      className="flex-1 items-center justify-center gap-4 bg-background px-8"
      accessibilityLiveRegion="polite"
      onLayout={reportReady}
    >
      <Text className="text-center text-xl font-semibold text-foreground">
        {t(showManual ? 'backup.restart.title' : 'backup.restart.automatic')}
      </Text>
      {showManual && (
        <Text className="text-center text-base text-muted-foreground">
          {t(Platform.OS === 'android' ? 'backup.restart.android' : 'backup.restart.description')}
        </Text>
      )}
    </View>
  );
}
