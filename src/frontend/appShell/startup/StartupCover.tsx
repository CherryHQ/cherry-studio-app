import { easing } from '@cherrystudio/ui/motion';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  getStartupExitDurationMs,
  STARTUP_ATTRIBUTION_ENTER_DURATION_MS,
  STARTUP_EXIT_FADE_DELAY_MS,
  STARTUP_EXIT_FADE_DURATION_MS,
  STARTUP_EXIT_LOGO_DURATION_MS,
  STARTUP_EXIT_LOGO_SCALE,
} from './startupState';

const STARTUP_LOGO = require('@/assets/icon.png');
const LOGO_SIZE = 96;
const ATTRIBUTION_SAFE_AREA_GAP = 48;
// The fade starts slowly so the logo's growth is readable before the cover thins out.
const coverFadeEasing = Easing.inOut(Easing.cubic);

const colors = {
  dark: {
    background: '#000000',
  },
  light: {
    background: '#FFFFFF',
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
  const logoScale = useSharedValue(1);
  const palette = colors[colorScheme];
  const exitDurationMs = getStartupExitDurationMs(reducedMotion);
  const attributionStyle = useAnimatedStyle(() => ({ opacity: attributionOpacity.get() }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.get() }] }));

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

    logoScale.set(
      withTiming(STARTUP_EXIT_LOGO_SCALE, {
        duration: STARTUP_EXIT_LOGO_DURATION_MS,
        easing: easing.settle,
        reduceMotion: ReduceMotion.System,
      }),
    );
    coverOpacity.set(
      withDelay(
        STARTUP_EXIT_FADE_DELAY_MS,
        withTiming(
          0,
          {
            duration: STARTUP_EXIT_FADE_DURATION_MS,
            easing: coverFadeEasing,
            reduceMotion: ReduceMotion.System,
          },
          (finished) => {
            if (finished) {
              scheduleOnRN(onExitComplete);
            }
          },
        ),
        ReduceMotion.System,
      ),
    );
  }, [coverOpacity, exitDurationMs, exitRequested, logoScale, onExitComplete]);

  useEffect(() => {
    return () => {
      cancelAnimation(attributionOpacity);
      cancelAnimation(coverOpacity);
      cancelAnimation(logoScale);
    };
  }, [attributionOpacity, coverOpacity, logoScale]);

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
        <Animated.Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={STARTUP_LOGO}
          style={[styles.logo, logoStyle]}
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
