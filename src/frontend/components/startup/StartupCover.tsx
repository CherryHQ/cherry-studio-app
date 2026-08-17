import { easing } from '@cherrystudio/ui/motion';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { getStartupExitDurationMs, STARTUP_ATTRIBUTION_ENTER_DURATION_MS } from './startupState';

const STARTUP_LOGO = require('@/assets/cherry-studio-splash-logo.png');
const LOGO_SIZE = 96;
const ATTRIBUTION_SAFE_AREA_GAP = 48;

const colors = {
  dark: {
    background: '#000000',
    secondaryText: '#A1A1AA',
  },
  light: {
    background: '#FFFFFF',
    secondaryText: '#6B7280',
  },
} as const;

type StartupCoverProps = {
  colorScheme: 'dark' | 'light';
  coverPresented: boolean;
  exitRequested: boolean;
  onExitComplete: () => void;
  onLayout: () => void;
};

export function StartupCover({
  colorScheme,
  coverPresented,
  exitRequested,
  onExitComplete,
  onLayout,
}: StartupCoverProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const attributionOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const coverOpacity = useSharedValue(1);
  const palette = colors[colorScheme];
  const exitDurationMs = getStartupExitDurationMs(reducedMotion);
  const attributionStyle = useAnimatedStyle(() => ({ opacity: attributionOpacity.get() }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.get() }));

  useEffect(() => {
    if (!coverPresented) {
      return;
    }

    if (reducedMotion) {
      attributionOpacity.set(1);
      return;
    }

    attributionOpacity.set(
      withTiming(1, {
        duration: STARTUP_ATTRIBUTION_ENTER_DURATION_MS,
        easing: easing.settle,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [attributionOpacity, coverPresented, reducedMotion]);

  useEffect(() => {
    if (!exitRequested) {
      return;
    }

    if (exitDurationMs === 0) {
      onExitComplete();
      return;
    }

    coverOpacity.set(
      withTiming(
        0,
        {
          duration: exitDurationMs,
          easing: easing.settle,
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) {
            scheduleOnRN(onExitComplete);
          }
        },
      ),
    );
  }, [coverOpacity, exitDurationMs, exitRequested, onExitComplete]);

  useEffect(() => {
    return () => {
      cancelAnimation(attributionOpacity);
      cancelAnimation(coverOpacity);
    };
  }, [attributionOpacity, coverOpacity]);

  return (
    <Animated.View
      accessibilityViewIsModal
      collapsable={false}
      pointerEvents="auto"
      style={[styles.cover, { backgroundColor: palette.background }, coverStyle]}
      testID="startup-cover"
      onLayout={onLayout}
    >
      <StatusBar animated={false} style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <View pointerEvents="none" style={styles.logoContainer}>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={STARTUP_LOGO}
          style={styles.logo}
        />
      </View>
      <Animated.View
        accessible={false}
        pointerEvents="none"
        style={[
          styles.attribution,
          { bottom: insets.bottom + ATTRIBUTION_SAFE_AREA_GAP },
          attributionStyle,
        ]}
      >
        <Text
          accessible={false}
          allowFontScaling={false}
          style={[styles.fromText, { color: palette.secondaryText }]}
        >
          from
        </Text>
        <Text accessible={false} allowFontScaling={false} style={styles.brandText}>
          Cherry Studio
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  attribution: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  brandText: {
    color: '#FF5757',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 24,
  },
  cover: {
    bottom: 0,
    elevation: 1_000,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1_000,
  },
  fromText: {
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  },
  logo: {
    height: LOGO_SIZE,
    width: LOGO_SIZE,
  },
  logoContainer: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
