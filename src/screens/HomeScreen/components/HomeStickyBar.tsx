import { useThemeColor } from 'heroui-native/hooks';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { homeHeader } from '@/config/constants';

const fadeTravel = homeHeader.collapseDistance;
const fadeStart = fadeTravel * homeHeader.crossFadeStartRatio;
const fadeInput = [0, fadeStart, fadeTravel];

type HomeStickyBarProps = {
  scrollY: SharedValue<number>;
  topInset: number;
  userName: string;
};

/**
 * Self-drawn sticky header bar (the screen runs headerShown:false). Background
 * + hairline and the centered small title cross-fade in over [0, 0.75R, R] as
 * the hero scrolls out. Absolute overlay, last sibling so it paints on top;
 * `box-none` root + `none` on the painted layers means it never eats touches
 * while transparent.
 */
export function HomeStickyBar({ scrollY, topInset, userName }: HomeStickyBarProps) {
  const separatorColor = useThemeColor('separator');

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, fadeInput, [0, 0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, fadeInput, [0, 0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View className="absolute top-0 right-0 left-0" pointerEvents="box-none">
      <Animated.View
        className="absolute inset-0 bg-background"
        pointerEvents="none"
        style={[
          backgroundStyle,
          { borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      />
      <View style={{ paddingTop: topInset }}>
        <View className="h-11 items-center justify-center px-4">
          <Animated.Text
            className="font-semibold text-[17px] text-foreground"
            numberOfLines={1}
            pointerEvents="none"
            style={titleStyle}
          >
            {userName}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}
