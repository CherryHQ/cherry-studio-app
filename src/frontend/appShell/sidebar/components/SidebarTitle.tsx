import { easing } from '@cherrystudio/ui/motion';
import { useDrawerStatus } from 'expo-router/drawer';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const baseFontSize = 24;
const minFontSize = 18;
const lapGap = 40;
const lapDelay = 1200;
const lapSpeed = 40;

const textClassName = 'font-semibold text-2xl text-sidebar-foreground';
/**
 * Yoga caps a row child's width at its container unless the row overflows as `scroll`, so only
 * then does the name keep its full width instead of ending in an ellipsis. Native views clip
 * `scroll` exactly like `hidden`.
 */
const unbounded = { overflow: 'scroll' } as const;

type SidebarTitleProps = {
  name: string;
  /** Width the title may occupy; the name shrinks toward `minFontSize` to fit it. */
  width: number;
};

/**
 * Shows a device name in full, never truncated with an ellipsis. A name wider than `width` first
 * shrinks, down to `minFontSize`; one still too wide is clipped and scrolls by in a marquee.
 *
 * Motion: the marquee reveals the clipped end of the name. It runs one lap, after `lapDelay`,
 * each time the drawer opens or the name changes, then rests at the start of the name. Closing
 * the drawer cancels it and returns to the start. With reduced motion it does not run; the full
 * name stays readable in the device menu and the switcher's accessibility label.
 */
export function SidebarTitle({ name, width }: SidebarTitleProps) {
  // Natural width at the base size, measured by an unconstrained copy so the fitted size never
  // feeds back into its own measurement.
  const [natural, setNatural] = useState<{ name: string; width: number }>();
  const naturalWidth = natural?.name === name ? natural.width : undefined;
  const fits = !naturalWidth || !width || naturalWidth <= width;
  const fontSize = fits
    ? baseFontSize
    : Math.max(minFontSize, Math.floor((baseFontSize * width * 2) / naturalWidth) / 2);
  const textWidth = naturalWidth ? (naturalWidth * fontSize) / baseFontSize : 0;
  const lap = !fits && textWidth > width ? textWidth + lapGap : 0;

  const open = useDrawerStatus() === 'open';
  const reducedMotion = useReducedMotion();
  const offset = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    if (!open || reducedMotion || !lap) return;
    // The second copy sits exactly one lap behind, so snapping back to 0 is seamless.
    offset.value = withDelay(
      lapDelay,
      withTiming(-lap, { duration: (lap / lapSpeed) * 1000, easing: easing.linear }, (finished) => {
        if (finished) offset.value = 0;
      }),
    );
    return () => cancelAnimation(offset);
  }, [lap, offset, open, reducedMotion]);
  const lapStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    // The unbounded rows report their full width upward; capping the title keeps that width from
    // pushing the trailing chevron out of the header.
    <View className="shrink" style={width ? { maxWidth: width } : undefined}>
      <View className="flex-row" style={lap ? [unbounded, { width }] : unbounded}>
        <Animated.View className="shrink-0 flex-row" style={lapStyle}>
          <Text className={`shrink-0 ${textClassName}`} numberOfLines={1} style={{ fontSize }}>
            {name}
          </Text>
          {lap ? (
            <Text
              accessibilityElementsHidden
              className={`shrink-0 ${textClassName}`}
              importantForAccessibility="no-hide-descendants"
              numberOfLines={1}
              style={{ fontSize, marginLeft: lapGap }}
            >
              {name}
            </Text>
          ) : null}
        </Animated.View>
      </View>
      <View
        accessibilityElementsHidden
        className="h-0 flex-row"
        importantForAccessibility="no-hide-descendants"
        style={unbounded}
      >
        <Text
          className={`shrink-0 ${textClassName}`}
          numberOfLines={1}
          onLayout={(event) => setNatural({ name, width: event.nativeEvent.layout.width })}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}
