import { type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { StartupCoverVisibleProvider, StartupReadinessProvider } from './StartupReadinessContext';
import { useStartupLifecycle } from './useStartupLifecycle';

type StartupCoordinatorProps = PropsWithChildren<{
  bootstrapReady: boolean;
}>;

export function StartupCoordinator({ bootstrapReady, children }: StartupCoordinatorProps) {
  const lifecycle = useStartupLifecycle(bootstrapReady);

  return (
    <StartupReadinessProvider reportContentReady={lifecycle.reportContentReady}>
      <View
        accessibilityElementsHidden={lifecycle.coverVisible}
        importantForAccessibility={lifecycle.coverVisible ? 'no-hide-descendants' : 'auto'}
        pointerEvents={lifecycle.coverVisible ? 'none' : 'auto'}
        style={styles.root}
      >
        <StartupCoverVisibleProvider visible={lifecycle.coverVisible}>
          {children}
        </StartupCoverVisibleProvider>
      </View>
    </StartupReadinessProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
