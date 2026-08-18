import { useSegments } from 'expo-router';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStartupReadyAfterFrames } from './useStartupReadyAfterFrames';

export function StartupRouteReadyReporter({ children }: PropsWithChildren) {
  const segments = useSegments();
  const reportReadyAfterFrames = useStartupReadyAfterFrames();
  const hasLayoutRef = useRef(false);
  // Every route reports readiness from its root layout, including the default
  // chat route: its cold-start empty state has no async content, so the first
  // laid-out frame already is the final UI.
  const shouldReportRouteReady = segments.length > 0;

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
