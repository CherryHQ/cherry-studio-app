import { useThemeColor } from 'heroui-native/hooks';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, Text, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Image } from '@/components/nativePrimitives';
import { profileHero } from '@/config/constants';
import { useAvatar } from '@/hooks/useAvatar';

type ProfileHeroProps = {
  lockProgress: SharedValue<number>;
  onPress: () => void;
  scrollY: SharedValue<number>;
  userName: string;
};

/**
 * Profile hero for the Settings tab. At rest it's a compact box (`restingHeight`)
 * with a small centered avatar and the name just below it. On tap — or an iOS
 * pull-down past the lock threshold — `lockProgress` animates 0->1 and the whole
 * thing expands into a Telegram-style half-screen, full-width photo header with
 * the name pinned bottom-left.
 *
 * Resting and expanded heights are decoupled: the container's own height
 * animates from `restingHeight` to ~half the screen, so expanding pushes the
 * settings list below it down (it never draws over the list). Everything —
 * container height, avatar geometry, name position/colour, the legibility scrim
 * — is driven off the single `lockProgress` clock. Separately, the resting hero
 * fades out on scroll-up so ProfileStickyBar can take over.
 */
export function ProfileHero({ lockProgress, onPress, scrollY, userName }: ProfileHeroProps) {
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const foregroundColor = useThemeColor('foreground');
  const avatarSource = useAvatar();
  const nameWidth = useSharedValue(0);
  const measuredNameRef = useRef<string | null>(null);

  const restingHeight = profileHero.restingHeight;
  const expandedHeight = Math.round(screenHeight * profileHero.expandedHeightRatio);
  const avatarRestLeft = (screenWidth - profileHero.avatarSize) / 2;
  const hasUserName = userName.trim().length > 0;

  const handleNameLayout = useCallback(
    (event: LayoutChangeEvent) => {
      // Record the baseline width once per name so the worklet can shift the
      // centered text to left-aligned. Re-fires are ignored (font size is fixed
      // here, but keep the guard so a resize doesn't clobber a valid width).
      if (measuredNameRef.current === userName) {
        return;
      }
      measuredNameRef.current = userName;
      nameWidth.value = event.nativeEvent.layout.width;
    },
    [nameWidth, userName],
  );

  // The container grows on lock (pushing the list below down) and fades out as
  // the list scrolls up so the sticky bar can take over.
  const containerStyle = useAnimatedStyle(() => ({
    height: interpolate(lockProgress.value, [0, 1], [restingHeight, expandedHeight]),
    opacity: interpolate(
      scrollY.value,
      [0, profileHero.scrollFadeDistance],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Avatar: a small centered circle at rest -> full-bleed photo filling the
  // expanded container, with only the bottom corners rounded (Telegram look).
  const photoStyle = useAnimatedStyle(() => ({
    top: interpolate(lockProgress.value, [0, 1], [profileHero.avatarRestTop, 0]),
    left: interpolate(lockProgress.value, [0, 1], [avatarRestLeft, 0]),
    width: interpolate(lockProgress.value, [0, 1], [profileHero.avatarSize, screenWidth]),
    height: interpolate(lockProgress.value, [0, 1], [profileHero.avatarSize, expandedHeight]),
    borderTopLeftRadius: interpolate(lockProgress.value, [0, 1], [profileHero.avatarSize / 2, 0]),
    borderTopRightRadius: interpolate(lockProgress.value, [0, 1], [profileHero.avatarSize / 2, 0]),
    borderBottomLeftRadius: interpolate(
      lockProgress.value,
      [0, 1],
      [profileHero.avatarSize / 2, profileHero.expandedRadius],
    ),
    borderBottomRightRadius: interpolate(
      lockProgress.value,
      [0, 1],
      [profileHero.avatarSize / 2, profileHero.expandedRadius],
    ),
  }));

  // Dim over the photo, fading in only as it expands, so the white name reads.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lockProgress.value, [0, 1], [0, profileHero.expandedScrimOpacity]),
  }));

  // Name: centered under the resting avatar -> left-aligned at the photo's
  // bottom-left, colour easing from the theme foreground to white on the photo.
  // Vertical placement follows the bottom-pinned wrapper as the container grows.
  const nameStyle = useAnimatedStyle(() => ({
    color: interpolateColor(lockProgress.value, [0, 1], [foregroundColor, '#ffffff']),
    transform: [
      {
        translateX: interpolate(
          lockProgress.value,
          [0, 1],
          [0, profileHero.nameOverlayInsetX + nameWidth.value / 2 - screenWidth / 2],
        ),
      },
    ],
  }));

  return (
    <Animated.View className="overflow-hidden" style={[containerStyle, { width: screenWidth }]}>
      <Animated.View className="absolute overflow-hidden" style={photoStyle}>
        <Pressable
          accessibilityLabel={t('settings.profile.toggleAvatar')}
          accessibilityRole="button"
          className="h-full w-full active:opacity-90"
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
        <Animated.View
          className="absolute inset-0 bg-black"
          pointerEvents="none"
          style={scrimStyle}
        />
      </Animated.View>
      <Animated.View
        className="absolute right-0 bottom-0 left-0 items-center"
        pointerEvents={hasUserName ? 'none' : 'box-none'}
        style={{ paddingBottom: profileHero.nameRestPaddingBottom }}
      >
        {hasUserName ? (
          <Animated.Text
            className="font-semibold"
            numberOfLines={1}
            onLayout={handleNameLayout}
            style={[
              nameStyle,
              {
                fontSize: profileHero.nameBaseFontSize,
                lineHeight: profileHero.nameLineHeight,
                maxWidth: screenWidth - 2 * profileHero.nameOverlayInsetX,
              },
            ]}
          >
            {userName}
          </Animated.Text>
        ) : (
          // No name yet: show a tappable prompt in the name slot. Tapping it (or
          // the avatar) opens profile settings instead of toggling the expand
          // lock — `onPress` is wired to that by the parent when the name is empty.
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={onPress}
            style={{ maxWidth: screenWidth - 2 * profileHero.nameOverlayInsetX }}
          >
            <Text
              className="text-center font-medium text-base text-foreground-secondary"
              numberOfLines={1}
            >
              {t('settings.profile.setPrompt')}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </Animated.View>
  );
}
