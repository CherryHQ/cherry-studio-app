import { type PropsWithChildren, useState } from 'react';
import { Appearance, StyleSheet, View } from 'react-native';

import { StartupCover } from './StartupCover';
import { StartupReadinessProvider } from './StartupReadinessContext';
import { normalizeStartupColorScheme } from './startupState';
import { useStartupLifecycle } from './useStartupLifecycle';

type StartupCoordinatorProps = PropsWithChildren<{
  bootstrapReady: boolean;
  onCoverPresented?: () => void;
}>;

export function StartupCoordinator({
  bootstrapReady,
  children,
  onCoverPresented,
}: StartupCoordinatorProps) {
  const [colorScheme] = useState(() => normalizeStartupColorScheme(Appearance.getColorScheme()));
  const lifecycle = useStartupLifecycle(bootstrapReady, onCoverPresented);

  return (
    <StartupReadinessProvider reportContentReady={lifecycle.reportContentReady}>
      <View style={styles.root}>
        <View
          accessibilityElementsHidden={lifecycle.coverVisible}
          importantForAccessibility={lifecycle.coverVisible ? 'no-hide-descendants' : 'auto'}
          pointerEvents={lifecycle.coverVisible ? 'none' : 'auto'}
          style={styles.content}
        >
          {children}
        </View>
        {lifecycle.coverVisible ? (
          <StartupCover
            colorScheme={colorScheme}
            coverPresented={lifecycle.coverPresented}
            exitRequested={lifecycle.exitRequested}
            onExitComplete={lifecycle.handleCoverExitComplete}
            onLayout={lifecycle.handleCoverLayout}
          />
        ) : null}
      </View>
    </StartupReadinessProvider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  root: { flex: 1 },
});
