import { useSegments } from 'expo-router';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStartupReadyAfterFrames } from './useStartupReadyAfterFrames';

export function StartupRouteReadyReporter({ children }: PropsWithChildren) {
  const segments = useSegments();
  const reportReadyAfterFrames = useStartupReadyAfterFrames();
  const hasLayoutRef = useRef(false);
  // Keep the UU callback placeholder covered until the validated target replaces it.
  // Ordinary routes, including an empty chat, are ready after their root layout.
  const shouldReportRouteReady = segments.length > 0 && segments[0] !== 'uu-remote';

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
