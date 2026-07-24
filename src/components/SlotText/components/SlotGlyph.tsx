import { useLayoutEffect, useMemo } from 'react';
import { Animated, Easing, type StyleProp, Text, type TextStyle, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import type { ResolvedSlotTextOptions } from '../SlotText.types';
import { calculateSlotTransitionTiming, getVisibleSegmentText } from '../utils/slotText';

const faceEasing = Easing.bezier(0.23, 0, 0.23, 0.99);
const widthEasing = ReanimatedEasing.bezier(0.2, 0, 0, 1);

const slotStyle = {
  flexShrink: 0,
  overflow: 'hidden',
  position: 'relative',
} as const;

const faceStyle = {
  alignItems: 'center',
  bottom: 0,
  justifyContent: 'center',
  left: 0,
  position: 'absolute',
  right: 0,
  top: 0,
} as const;

type SlotGlyphProps = {
  allowFontScaling?: boolean;
  currentSegment: string;
  currentWidth: number;
  entryPhaseStartMs: number;
  exitPhaseDurationMs: number;
  height: number;
  highlightColor?: string;
  index: number;
  maxFontSizeMultiplier?: number;
  options: ResolvedSlotTextOptions;
  segmentCount: number;
  shouldAnimate: boolean;
  targetSegment: string;
  targetWidth: number;
  textClassName?: string;
  textStyle?: StyleProp<TextStyle>;
  transitionId: number;
};

type GlyphTextProps = Pick<
  SlotGlyphProps,
  'allowFontScaling' | 'maxFontSizeMultiplier' | 'textClassName' | 'textStyle'
> & {
  color?: string;
  segment: string;
};

export function SlotGlyph({
  allowFontScaling,
  currentSegment,
  currentWidth,
  entryPhaseStartMs,
  exitPhaseDurationMs,
  height,
  highlightColor,
  index,
  maxFontSizeMultiplier,
  options,
  segmentCount,
  shouldAnimate,
  targetSegment,
  targetWidth,
  textClassName,
  textStyle,
  transitionId,
}: SlotGlyphProps) {
  const slotWidth = useSharedValue(currentWidth);

  const transitionSignature = `${transitionId}:${currentSegment.length}:${currentSegment}:${targetSegment}`;
  // Faces must mount already posed at their transition start values; seeding them only in
  // the layout effect can paint one native frame at the final pose first, which shows the
  // incoming glyph overlapping the outgoing one.

  /* eslint-disable react-hooks/exhaustive-deps */
  // biome-ignore lint/correctness/useExhaustiveDependencies: Poses re-seed per transition; geometry changes re-seed in the layout effect below.
  const faces = useMemo(
    () => ({
      highlightOpacity: new Animated.Value(shouldAnimate && highlightColor ? 1 : 0),
      incomingY: new Animated.Value(shouldAnimate ? -height : 0),
      outgoingY: new Animated.Value(0),
    }),
    [transitionSignature],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  const { highlightOpacity, incomingY, outgoingY } = faces;
  const slotTiming = calculateSlotTransitionTiming(
    index,
    segmentCount,
    currentSegment,
    targetSegment,
    options,
    { entryPhaseStartMs, exitPhaseDurationMs },
    Boolean(highlightColor),
  );
  const glyphTiming = slotTiming.entry;
  const widthTiming = slotTiming.width;
  const rotationDegrees = 30 + options.bounce * 25 + glyphTiming.startingTiltDegrees;
  const minimumScale = 0.25 + (1 - options.bounce) * 0.2;

  useLayoutEffect(() => {
    void transitionSignature;
    cancelAnimation(slotWidth);
    outgoingY.stopAnimation();
    incomingY.stopAnimation();
    highlightOpacity.stopAnimation();

    if (!shouldAnimate) {
      slotWidth.set(targetWidth);
      outgoingY.setValue(0);
      incomingY.setValue(0);
      highlightOpacity.setValue(0);
      return;
    }

    slotWidth.set(currentWidth);
    slotWidth.set(
      withDelay(
        widthTiming.startDelayMs,
        withTiming(targetWidth, {
          duration: widthTiming.durationMs,
          easing: widthEasing,
        }),
      ),
    );

    outgoingY.setValue(0);
    incomingY.setValue(-height);
    highlightOpacity.setValue(highlightColor ? 1 : 0);

    const animations = [
      Animated.timing(outgoingY, {
        duration: slotTiming.exitDurationMs,
        easing: faceEasing,
        toValue: height,
        useNativeDriver: true,
      }),
      Animated.timing(incomingY, {
        delay: glyphTiming.startDelayMs,
        duration: glyphTiming.durationMs,
        easing: faceEasing,
        toValue: 0,
        useNativeDriver: true,
      }),
    ];

    if (highlightColor) {
      animations.push(
        Animated.timing(highlightOpacity, {
          delay: glyphTiming.startDelayMs + glyphTiming.durationMs,
          duration: options.colorFadeDurationMs,
          easing: Easing.linear,
          toValue: 0,
          useNativeDriver: true,
        }),
      );
    }

    Animated.parallel(animations).start();

    return () => {
      outgoingY.stopAnimation();
      incomingY.stopAnimation();
      highlightOpacity.stopAnimation();
      cancelAnimation(slotWidth);
    };
  }, [
    currentWidth,
    glyphTiming.durationMs,
    glyphTiming.startDelayMs,
    height,
    highlightColor,
    highlightOpacity,
    incomingY,
    options.colorFadeDurationMs,
    outgoingY,
    shouldAnimate,
    slotTiming.exitDurationMs,
    slotWidth,
    targetWidth,
    transitionSignature,
    widthTiming.durationMs,
    widthTiming.startDelayMs,
  ]);

  const animatedSlotStyle = useAnimatedStyle(() => ({
    width: Math.max(0, slotWidth.get()),
  }));
  const outgoingStyle = createFaceAnimationStyle(outgoingY, height, minimumScale, rotationDegrees);
  const incomingStyle = createFaceAnimationStyle(incomingY, height, minimumScale, rotationDegrees);
  const highlightIncomingStyle = createFaceAnimationStyle(
    incomingY,
    height,
    minimumScale,
    rotationDegrees,
  );

  return (
    <Reanimated.View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[slotStyle, { height }, animatedSlotStyle]}
    >
      {shouldAnimate ? (
        <>
          {currentSegment ? (
            <Animated.View style={[faceStyle, outgoingStyle]}>
              <GlyphText
                allowFontScaling={allowFontScaling}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
                segment={currentSegment}
                textClassName={textClassName}
                textStyle={textStyle}
              />
            </Animated.View>
          ) : null}
          {targetSegment ? (
            <>
              <Animated.View style={[faceStyle, incomingStyle]}>
                <GlyphText
                  allowFontScaling={allowFontScaling}
                  maxFontSizeMultiplier={maxFontSizeMultiplier}
                  segment={targetSegment}
                  textClassName={textClassName}
                  textStyle={textStyle}
                />
              </Animated.View>
              {highlightColor ? (
                <Animated.View
                  style={[faceStyle, highlightIncomingStyle, { opacity: highlightOpacity }]}
                >
                  <GlyphText
                    allowFontScaling={allowFontScaling}
                    color={highlightColor}
                    maxFontSizeMultiplier={maxFontSizeMultiplier}
                    segment={targetSegment}
                    textClassName={textClassName}
                    textStyle={textStyle}
                  />
                </Animated.View>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <View style={faceStyle}>
          <GlyphText
            allowFontScaling={allowFontScaling}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            segment={targetSegment}
            textClassName={textClassName}
            textStyle={textStyle}
          />
        </View>
      )}
    </Reanimated.View>
  );
}

function createFaceAnimationStyle(
  translateY: Animated.Value,
  height: number,
  minimumScale: number,
  rotationDegrees: number,
) {
  const safeHeight = Math.max(1, height);
  return {
    opacity: translateY.interpolate({
      extrapolate: 'clamp',
      inputRange: [-safeHeight, 0, safeHeight],
      outputRange: [0, 1, 0],
    }),
    transform: [
      { translateY },
      {
        scale: translateY.interpolate({
          extrapolate: 'clamp',
          inputRange: [-safeHeight, 0, safeHeight],
          outputRange: [minimumScale, 1, minimumScale],
        }),
      },
      {
        rotateX: translateY.interpolate({
          extrapolate: 'clamp',
          inputRange: [-safeHeight, 0, safeHeight],
          outputRange: [`${rotationDegrees}deg`, '0deg', `${-rotationDegrees}deg`],
        }),
      },
    ],
  };
}

function GlyphText({
  allowFontScaling,
  color,
  maxFontSizeMultiplier,
  segment,
  textClassName,
  textStyle,
}: GlyphTextProps) {
  return (
    <Text
      accessible={false}
      allowFontScaling={allowFontScaling}
      className={textClassName}
      ellipsizeMode="clip"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      numberOfLines={1}
      style={[textStyle, color ? { color } : undefined]}
    >
      {getVisibleSegmentText(segment)}
    </Text>
  );
}
