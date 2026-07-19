import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Image } from '@/components/nativePrimitives';
import { ProfileAvatarEditBadge } from '@/components/ProfileAvatar';
import { homeHeader } from '@/config/constants';

const avatarSource = require('@/assets/icon.png');

const heroHeight = homeHeader.heroContainerHeight;
// Clip trick from the reference header: the box's bounds extend far above its
// layout slot, so the expanding image may spill over the status bar while the
// bottom edge still clips it away from the content below.
const clipOverflow = heroHeight * 4;
// Locked, the image overhangs both clip edges by the corner radius, pushing
// all rounding out of the visible area: the top reads as clean full-bleed
// (no black notches beside the corners) and the bottom as a flat cut — the
// reference's rendered look, where the container clips its radius away.
const heroEdgeOverhang = homeHeader.expandedRadius;
// Resting avatar top inside the hero box (was: centered flex child with a
// top margin); kept as the absolute-position baseline the pull animates from.
const avatarRestTop =
  (heroHeight - homeHeader.avatarSize - homeHeader.avatarRestMarginTop) / 2 +
  homeHeader.avatarRestMarginTop;
// Resting name bottom padding: the avatar block (size + rest margin) centers in
// the hero box, and the name hangs `nameGap` below its bottom edge.
const nameRestPaddingBottom =
  (heroHeight - homeHeader.avatarSize - homeHeader.avatarRestMarginTop) / 2 -
  homeHeader.nameGap -
  homeHeader.nameLineHeight;

type HomeProfileHeroProps = {
  lockProgress: SharedValue<number>;
  lockState: SharedValue<number>;
  onPress: () => void;
  scrollY: SharedValue<number>;
  userName: string;
};

/**
 * The animated avatar + name hero, mirroring the reference parallax header's
 * geometry: a fixed-height box pinned to the very top of the scroll content
 * (drawing under the status bar), with the avatar centered inside it and the
 * name as a bottom-pinned overlay. The image chases its interpolated target
 * through `withTiming`, so the pull feels elastic and the locked full-bleed
 * hero holds after release — expansion overflows the box instead of pushing
 * the content below.
 */
export function HomeProfileHero({
  lockProgress,
  lockState,
  onPress,
  scrollY,
  userName,
}: HomeProfileHeroProps) {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const nameWidth = useSharedValue(0);
  const measuredNameRef = useRef<string | null>(null);

  const handleNameLayout = useCallback(
    (event: LayoutChangeEvent) => {
      // Record the baseline width once per name. fontSize animates
      // via the worklet, so later onLayouts report scaled widths — ignore them.
      if (measuredNameRef.current === userName) {
        return;
      }
      measuredNameRef.current = userName;
      nameWidth.value = event.nativeEvent.layout.width;
    },
    [nameWidth, userName],
  );

  // Overscroll stretch/parallax on the whole box (scale + counter-translate),
  // and a fade-out over the first half of the scroll-up so the sticky bar can
  // take over cleanly.
  const parallaxStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, heroHeight / 2], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [-heroHeight, 0], [2.5, 1], Extrapolation.CLAMP) },
      {
        translateY: interpolate(
          scrollY.value,
          [-heroHeight, 0],
          [heroHeight * 0.3, 0],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          scrollY.value,
          [-heroHeight, 0, heroHeight],
          [-heroHeight * 0.6, 0, heroHeight * 0.5],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // The image chases its target: while pulling, the target tracks the stretch;
  // once latched, it holds full-bleed until a real scroll-up releases it.
  // Absolutely positioned so the expansion is exact — top/bottom overhang the
  // clip edges instead of relying on center-overflow, and `left` mirrors
  // `width` through the same timing so the box stays horizontally centered.
  const imageBoxStyle = useAnimatedStyle(() => {
    const stretch = Math.max(0, -scrollY.value);
    const expansion =
      lockState.value === 1
        ? 1
        : interpolate(stretch, [0, homeHeader.lockTriggerPx], [0, 1], Extrapolation.CLAMP);
    const width = interpolate(expansion, [0, 1], [homeHeader.avatarSize, screenWidth]);
    const height = interpolate(
      expansion,
      [0, 1],
      [homeHeader.avatarSize, heroHeight + 2 * heroEdgeOverhang],
    );
    const top = interpolate(expansion, [0, 1], [avatarRestTop, -heroEdgeOverhang]);
    const borderRadius = interpolate(
      expansion,
      [0, 1],
      [homeHeader.avatarSize / 2, homeHeader.expandedRadius],
    );

    return {
      borderRadius: withTiming(borderRadius, { duration: homeHeader.lockTimingMs }),
      height: withTiming(height, { duration: homeHeader.lockTimingMs }),
      left: withTiming((screenWidth - width) / 2, { duration: homeHeader.lockTimingMs }),
      top: withTiming(top, { duration: homeHeader.lockTimingMs }),
      width: withTiming(width, { duration: homeHeader.lockTimingMs }),
    };
  });

  // The overlay dims during a deep pull and while scrolling out, but is fully
  // opaque at rest — including the locked rest, where the hero sits full-bleed.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [-heroHeight / 2, 0, heroHeight * 0.6],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const nameStyle = useAnimatedStyle(() => {
    const expandedWidth =
      nameWidth.value * (homeHeader.expandedNameFontSize / homeHeader.nameBaseFontSize);
    return {
      fontSize: interpolate(
        lockProgress.value,
        [0, 1],
        [homeHeader.nameBaseFontSize, homeHeader.expandedNameFontSize],
      ),
      lineHeight: interpolate(
        lockProgress.value,
        [0, 1],
        [homeHeader.nameLineHeight, homeHeader.expandedNameLineHeight],
      ),
      transform: [
        {
          // Centered → left-aligned at nameOverlayInsetX on the big hero.
          translateX: interpolate(
            lockProgress.value,
            [0, 1],
            [0, homeHeader.nameOverlayInsetX + expandedWidth / 2 - screenWidth / 2],
          ),
        },
        { translateY: interpolate(lockProgress.value, [0, 1], [0, -homeHeader.nameLockedRise]) },
      ],
    };
  });

  const badgeStyle = useAnimatedStyle(() => {
    // Edit badge fades out with the direct pull, before the hero locks.
    const pullProgress = interpolate(
      Math.max(0, -scrollY.value),
      [0, homeHeader.lockTriggerPx],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: interpolate(
        Math.max(pullProgress, lockProgress.value),
        [0, 0.25],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  return (
    <View
      className="items-center overflow-hidden"
      // No explicit height: the box wraps padding + hero, and the negative
      // margin cancels the padding so its layout slot stays `heroHeight` tall.
      style={{ marginTop: -clipOverflow, paddingTop: clipOverflow }}
    >
      <Animated.View style={[parallaxStyle, { height: heroHeight, width: screenWidth }]}>
        <Animated.View className="absolute overflow-hidden" style={imageBoxStyle}>
          <Pressable
            accessibilityLabel={t('settings.profile.edit')}
            accessibilityRole="button"
            className="h-full w-full active:opacity-70"
            onPress={onPress}
          >
            <Image
              accessibilityIgnoresInvertColors
              cachePolicy="memory-disk"
              className="h-full w-full"
              contentFit="cover"
              source={avatarSource}
            />
          </Pressable>
        </Animated.View>
        {/* Pinned to the resting avatar spot; it fades out within the first
            quarter of the pull, before the absolute image box drifts away. */}
        <Animated.View
          className="absolute"
          pointerEvents="none"
          style={[
            badgeStyle,
            {
              height: homeHeader.avatarSize,
              left: (screenWidth - homeHeader.avatarSize) / 2,
              top: avatarRestTop,
              width: homeHeader.avatarSize,
            },
          ]}
        >
          <ProfileAvatarEditBadge icon="pencil" size={homeHeader.avatarSize} />
        </Animated.View>
      </Animated.View>
      <Animated.View
        className="absolute right-0 bottom-0 left-0 items-center"
        pointerEvents="none"
        style={[overlayStyle, { paddingBottom: nameRestPaddingBottom }]}
      >
        <Animated.Text
          className="font-semibold text-foreground"
          numberOfLines={1}
          onLayout={handleNameLayout}
          style={[nameStyle, { maxWidth: screenWidth - 2 * homeHeader.nameOverlayInsetX }]}
        >
          {userName}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}
