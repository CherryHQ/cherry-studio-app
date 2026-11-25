import { useSegments } from 'expo-router';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { FirstUseAdmissionProvider, useFirstUseAdmission } from '@/frontend/appShell/navigation';

import { useStartupReadyAfterFrames } from './useStartupReadyAfterFrames';

export function StartupRouteReadyReporter({ children }: PropsWithChildren) {
  const segments = useSegments();
  const route = segments[0];
  return (
    <FirstUseAdmissionProvider observe={route === '(drawer)'}>
      <RouteReadiness route={route}>{children}</RouteReadiness>
    </FirstUseAdmissionProvider>
  );
}

function RouteReadiness({ children, route }: PropsWithChildren<{ route?: string }>) {
  const admission = useFirstUseAdmission();
  const reportReadyAfterFrames = useStartupReadyAfterFrames();
  const hasLayoutRef = useRef(false);
  // Keep the UU callback placeholder covered until the validated target replaces it.
  // The drawer is ready only when admission keeps it as the visible destination.
  const shouldReportRouteReady = Boolean(
    route && route !== 'uu-remote' && (route !== '(drawer)' || admission === 'admitted'),
  );

  useEffect(() => {
    if (hasLayoutRef.current && shouldReportRouteReady) {
      reportReadyAfterFrames();
    }
  }, [reportReadyAfterFrames, shouldReportRouteReady]);

  const handleLayout = useCallback(() => {
    hasLayoutRef.current = true;
    if (shouldReportRouteReady) {
      reportReadyAfterFrames();
    }
  }, [reportReadyAfterFrames, shouldReportRouteReady]);

  return (
    <View collapsable={false} style={styles.root} onLayout={handleLayout}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
