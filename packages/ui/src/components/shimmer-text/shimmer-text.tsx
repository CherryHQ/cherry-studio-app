import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, type TextProps, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { shimmerTextMotion } from '../../motion';
import { cn } from '../../utils/cn';

const MINIMUM_BAND_WIDTH = 44;
const BAND_WIDTH_RATIO = 0.55;
const GRADIENT_END = { x: 1, y: 0.5 } as const;
const GRADIENT_LOCATIONS = [0, 0.5, 1] as const;
const GRADIENT_START = { x: 0, y: 0.5 } as const;
const TRANSPARENT = 'transparent';

export type ShimmerTextProps = Omit<TextProps, 'children'> &
  Readonly<{
    /** Runs the shimmer while true and shows the base text otherwise. */
    active?: boolean;
    children: string;
  }>;

/** Text with a token-colored highlight sweeping through its glyphs. */
export function ShimmerText({
  active = true,
  children,
  className,
  numberOfLines,
  onLayout,
  style,
  ...props
}: ShimmerTextProps) {
  const reducedMotion = useReducedMotion();
  const highlightStyle = useResolveClassNames('text-foreground-tertiary');
  const highlightColor = highlightStyle.color ?? 'transparent';
  const [textWidth, setTextWidth] = useState(0);
  const translateX = useSharedValue(0);
  const bandWidth = Math.max(MINIMUM_BAND_WIDTH, textWidth * BAND_WIDTH_RATIO);
  const isAnimating = active && !reducedMotion && textWidth > 0;

  useEffect(() => {
    cancelAnimation(translateX);
    translateX.set(-bandWidth);

    if (isAnimating) {
      translateX.set(withRepeat(withTiming(textWidth, shimmerTextMotion), -1, false));
    }

    return () => cancelAnimation(translateX);
  }, [bandWidth, isAnimating, textWidth, translateX]);

  const bandStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: translateX.get() }] }),
    [translateX],
  );
  const textClassName = cn(className, 'text-foreground');

  return (
    <View className="relative self-start">
      <Text
        {...props}
        className={textClassName}
        numberOfLines={numberOfLines}
        onLayout={(event) => {
          setTextWidth(event.nativeEvent.layout.width);
          onLayout?.(event);
        }}
        style={style}
      >
        {children}
      </Text>
      {isAnimating ? (
        <MaskedView
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          maskElement={
            <Text className={textClassName} numberOfLines={numberOfLines} style={style}>
              {children}
            </Text>
          }
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <Animated.View style={[styles.band, { width: bandWidth }, bandStyle]}>
            <LinearGradient
              colors={[TRANSPARENT, highlightColor, TRANSPARENT]}
              end={GRADIENT_END}
              locations={GRADIENT_LOCATIONS}
              start={GRADIENT_START}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </MaskedView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
});
