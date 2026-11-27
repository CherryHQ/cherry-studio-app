import { Image } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { type PropsWithChildren, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  createAnimatedComponent,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

const artwork = require('@/assets/subscription-avatar-ring.svg');
const AnimatedCircle = createAnimatedComponent(Circle);
const size = 44;
const center = size / 2;
const radius = 20.5;
const circumference = 2 * Math.PI * radius;
const rim = { cx: center, cy: center, r: radius, fill: 'none', strokeWidth: 2 } as const;
const morph = { duration: duration.slow, easing: easing.inOut };

/** A single glint on appearance. The same rim then recedes to the current window's fraction. */
export function SidebarAvatarRing({
  active,
  children,
  ratio,
}: PropsWithChildren<{ active: boolean; ratio?: number }>) {
  const [green, track, glintColor] = useThemeColor(['primary', 'border-strong', 'constant-white']);
  const glint = useSharedValue(0);
  useEffect(() => {
    glint.set(0);
    if (active) glint.set(withTiming(1, { duration: duration.slow * 2, easing: easing.inOut }));
    return () => cancelAnimation(glint);
  }, [active, glint]);

  const quotaOpacity = useDerivedValue(() => {
    const target = ratio === undefined ? 0 : 1;
    return active ? withTiming(target, morph) : target;
  });
  const fraction = useDerivedValue(() => {
    const target = ratio ?? 1;
    return active ? withTiming(target, morph) : target;
  });
  const artworkStyle = useAnimatedStyle(() => ({ opacity: 1 - quotaOpacity.get() }));
  const quotaStyle = useAnimatedStyle(() => ({ opacity: quotaOpacity.get() }));
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fraction.get()),
    strokeOpacity: fraction.get() > 0 ? 1 : 0,
  }));
  const glintProps = useAnimatedProps(() => ({
    strokeDashoffset: -circumference * (0.6 + 0.56 * glint.get()),
    strokeOpacity: 0.9 * Math.sin(Math.PI * glint.get()),
  }));

  return (
    <View
      aria-hidden
      className="shrink-0 items-center justify-center"
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      {children}
      <Animated.View style={[StyleSheet.absoluteFill, artworkStyle]}>
        <Image contentFit="contain" source={artwork} style={StyleSheet.absoluteFill} />
        <Svg width={size} height={size}>
          <AnimatedCircle
            {...rim}
            animatedProps={glintProps}
            rotation={-90}
            origin="22, 22"
            stroke={glintColor}
            strokeDasharray={[3, circumference - 3]}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, quotaStyle]}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin="22, 22">
            <Circle {...rim} stroke={track} />
            <AnimatedCircle
              {...rim}
              animatedProps={arcProps}
              stroke={green}
              strokeDasharray={[circumference, circumference]}
              strokeLinecap="round"
            />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
