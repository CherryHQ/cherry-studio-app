import { useEffect } from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { drawerFadeTimingConfig, drawerSpringConfig } from '../utils/drawerAnimation';

const closeButtonSize = 44;
const headerHorizontalPadding = 16;
const headerItemGap = 12;
const searchFieldRevealEnd = 0.24;
const searchFieldIconRevealStart = 0.72;

type UseDrawerHeaderAnimationOptions = {
  isSearchActive: boolean;
  screenWidth: number;
};

export function useDrawerHeaderAnimation({
  isSearchActive,
  screenWidth,
}: UseDrawerHeaderAnimationOptions) {
  const searchProgress = useSharedValue(0);
  const searchFadeProgress = useSharedValue(0);

  useEffect(() => {
    searchProgress.value = withSpring(isSearchActive ? 1 : 0, drawerSpringConfig);
    searchFadeProgress.value = withTiming(isSearchActive ? 1 : 0, drawerFadeTimingConfig);
  }, [isSearchActive, searchFadeProgress, searchProgress]);

  const collapsedHeaderStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(searchFadeProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
    };
  });

  const searchFieldSlotStyle = useAnimatedStyle(() => {
    const contentWidth = screenWidth - headerHorizontalPadding * 2;
    const collapsedSearchX = contentWidth - closeButtonSize * 2 - headerItemGap;
    const expandedSearchWidth = contentWidth - closeButtonSize - headerItemGap;

    return {
      left: interpolate(searchProgress.value, [0, 1], [collapsedSearchX, 0], Extrapolation.CLAMP),
      opacity: interpolate(
        searchFadeProgress.value,
        [0, searchFieldRevealEnd, 1],
        [0, 1, 1],
        Extrapolation.CLAMP,
      ),
      width: interpolate(
        searchProgress.value,
        [0, 1],
        [closeButtonSize, expandedSearchWidth],
        Extrapolation.CLAMP,
      ),
    };
  }, [screenWidth]);

  const closeButtonStyle = useAnimatedStyle(() => {
    const contentWidth = screenWidth - headerHorizontalPadding * 2;
    const expandedCloseX = contentWidth - closeButtonSize;

    return {
      left: expandedCloseX,
      opacity: searchFadeProgress.value,
    };
  }, [screenWidth]);

  const searchFieldIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        searchFadeProgress.value,
        [0, searchFieldIconRevealStart, 1],
        [0, 0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  return {
    closeButtonSize,
    closeButtonStyle,
    collapsedHeaderStyle,
    searchFieldIconStyle,
    searchFieldSlotStyle,
  };
}
