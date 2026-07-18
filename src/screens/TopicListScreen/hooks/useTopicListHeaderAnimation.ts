// Android-only: retained for the custom messages-tab header transition.
import { useEffect } from 'react';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { topicListFadeTimingConfig, topicListSpringConfig } from '../utils/topicListAnimation';

const closeButtonSize = 44;
const headerHorizontalPadding = 16;
const headerItemGap = 12;
const searchFieldRevealEnd = 0.24;
const searchFieldIconRevealStart = 0.72;

type UseTopicListHeaderAnimationOptions = {
  isSearchActive: boolean;
  screenWidth: number;
};

export function useTopicListHeaderAnimation({
  isSearchActive,
  screenWidth,
}: UseTopicListHeaderAnimationOptions) {
  const searchProgress = useSharedValue(0);
  const searchFadeProgress = useSharedValue(0);

  useEffect(() => {
    searchProgress.set(withSpring(isSearchActive ? 1 : 0, topicListSpringConfig));
    searchFadeProgress.set(withTiming(isSearchActive ? 1 : 0, topicListFadeTimingConfig));
  }, [isSearchActive, searchFadeProgress, searchProgress]);

  const collapsedHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(searchFadeProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  const contentWidth = screenWidth - headerHorizontalPadding * 2;
  const collapsedSearchX = contentWidth - closeButtonSize;
  const expandedSearchWidth = contentWidth - closeButtonSize - headerItemGap;
  const expandedCloseX = contentWidth - closeButtonSize;

  const searchFieldSlotStyle = useAnimatedStyle(
    () => ({
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
    }),
    [collapsedSearchX, expandedSearchWidth],
  );

  const closeButtonStyle = useAnimatedStyle(
    () => ({
      left: expandedCloseX,
      opacity: searchFadeProgress.value,
    }),
    [expandedCloseX],
  );

  const searchFieldIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      searchFadeProgress.value,
      [0, searchFieldIconRevealStart, 1],
      [0, 0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return {
    closeButtonSize,
    closeButtonStyle,
    collapsedHeaderStyle,
    expandedSearchWidth,
    searchFieldIconStyle,
    searchFieldSlotStyle,
  };
}
