import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { profileHero } from '@/frontend/utils/constants';

const fadeTravel = profileHero.collapseDistance;
const fadeStart = fadeTravel * profileHero.crossFadeStartRatio;
const fadeInput = [0, fadeStart, fadeTravel];

type ProfileStickyBarProps = {
  scrollY: SharedValue<number>;
  topInset: number;
  userName: string;
};

/**
 * Self-drawn sticky header bar (the screen runs headerShown:false). Its content
 * row is `profileHero.barHeight` tall, matched to the native native-stack
 * header (iOS 44pt / Android 56dp) so it lines up with every other screen's
 * real header. The opaque background + hairline and the centered small title
 * cross-fade in over [0, 0.75R, R] as the hero scrolls out, guarding the
 * status-bar area like a native collapsing title. Absolute overlay, last
 * sibling so it paints on top; `pointerEvents="none"` throughout so the locked
 * hero underneath always receives taps (a tap on it toggles the expand).
 */
export function ProfileStickyBar({ scrollY, topInset, userName }: ProfileStickyBarProps) {
  const { t } = useTranslation();
  const separatorColor = useThemeColor('border-strong');
  // Mirror the hero's name slot: fall back to the set-profile prompt when empty.
  const title = userName.trim().length > 0 ? userName : t('settings.profile.setPrompt');

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, fadeInput, [0, 0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, fadeInput, [0, 0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View className="absolute top-0 right-0 left-0" pointerEvents="none">
      <Animated.View
        className="absolute inset-0 bg-grouped-background"
        style={[
          backgroundStyle,
          { borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      />
      <View style={{ paddingTop: topInset }}>
        <View
          className="items-center justify-center px-4"
          style={{ height: profileHero.barHeight }}
        >
          <Animated.Text
            className="font-semibold text-[17px] text-foreground"
            numberOfLines={1}
            style={titleStyle}
          >
            {title}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}
