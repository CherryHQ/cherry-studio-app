import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { slotTextHighlightColor } from '@/frontend/utils/constants';

import { SlotGlyph } from './components/SlotGlyph';
import type { SlotTextProps } from './SlotText.types';
import {
  calculateAnimatedSlotFlags,
  calculateTransitionCompletionMs,
  calculateTransitionPhaseTiming,
  resolveSlotTextOptions,
  segmentTextIntoGraphemes,
} from './utils/slotText';

const animatedTextContainerStyle = {
  // Fabric can assert while recomputing Text baselines during Reanimated width commits.
  alignItems: 'flex-start',
  flexDirection: 'row',
  position: 'relative',
} as const;

const measurementLayerStyle = {
  flexDirection: 'row',
  left: 0,
  opacity: 0,
  position: 'absolute',
  top: 0,
  width: 10_000,
} as const;

type SegmentMetrics = {
  height: number;
  width: number;
};

type TextTransition = {
  canAnimate: boolean;
  fromText: string;
  id: number;
  targetText: string;
};

export function SlotText({
  accessibilityLabel,
  allowFontScaling,
  bounce,
  colorFadeDurationMs,
  containerStyle,
  durationMs,
  ellipsizeMode,
  exitOffsetMs,
  maxFontSizeMultiplier,
  maxGraphemes,
  skipUnchanged,
  staggerMs,
  testID,
  text,
  textClassName,
  textStyle,
}: SlotTextProps) {
  const resolvedEllipsizeMode = ellipsizeMode ?? 'clip';
  const reducedMotion = useReducedMotion();
  const resolved = resolveSlotTextOptions({
    bounce,
    colorFadeDurationMs,
    durationMs,
    exitOffsetMs,
    maxGraphemes,
    skipUnchanged,
    staggerMs,
  });
  const targetSegments = segmentTextIntoGraphemes(text);
  const isOverLimit = resolved.isValid && targetSegments.length > resolved.options.maxGraphemes;
  const canAnimate = resolved.isValid && !reducedMotion && !isOverLimit;
  const [transition, setTransition] = useState<TextTransition>(() => ({
    canAnimate,
    fromText: text,
    id: 0,
    targetText: text,
  }));
  const [segmentMetrics, setSegmentMetrics] = useState<ReadonlyMap<string, SegmentMetrics>>(
    () => new Map(),
  );

  // Retarget during render (not in an effect): an effect lets React commit one frame
  // where the new text renders statically at its final pose, which flashes on screen
  // before the transition state catches up.
  if (transition.targetText !== text || transition.canAnimate !== canAnimate) {
    setTransition(
      !canAnimate || !transition.canAnimate
        ? { canAnimate, fromText: text, id: transition.id + 1, targetText: text }
        : {
            canAnimate,
            fromText: transition.targetText,
            id: transition.id + 1,
            targetText: text,
          },
    );
  }

  useEffect(() => {
    if (__DEV__ && isOverLimit) {
      console.warn(
        `SlotText received ${targetSegments.length} graphemes; ` +
          `rendering static text because maxGraphemes is ${resolved.options.maxGraphemes}.`,
      );
    }
  }, [isOverLimit, resolved.options.maxGraphemes, targetSegments.length]);

  const hasCurrentTransition = transition.targetText === text && transition.canAnimate;
  const fromSegments = hasCurrentTransition
    ? segmentTextIntoGraphemes(transition.fromText)
    : targetSegments;
  const shouldAnimateTransition =
    canAnimate && hasCurrentTransition && transition.fromText !== transition.targetText;
  const measurementSegments = Array.from(
    new Set([...fromSegments, ...targetSegments].filter(Boolean)),
  );
  const hasFromMetrics = fromSegments.every(
    (segment) => segment === '' || segmentMetrics.has(segment),
  );
  const hasAllMetrics = measurementSegments.every((segment) => segmentMetrics.has(segment));
  const animatedSlotFlags = calculateAnimatedSlotFlags(
    fromSegments,
    targetSegments,
    resolved.options,
    (segment) => segmentMetrics.get(segment)?.width ?? 0,
  );
  const transitionPhaseTiming = calculateTransitionPhaseTiming(
    fromSegments,
    animatedSlotFlags,
    resolved.options,
  );
  const transitionCompletionMs = shouldAnimateTransition
    ? calculateTransitionCompletionMs(
        fromSegments,
        targetSegments,
        animatedSlotFlags,
        resolved.options,
        true,
      )
    : 0;

  useEffect(() => {
    if (!hasAllMetrics || !shouldAnimateTransition) {
      return;
    }

    const transitionId = transition.id;
    const timeout = setTimeout(() => {
      setTransition((current) => {
        if (current.id !== transitionId || current.targetText !== text) {
          return current;
        }

        return { ...current, fromText: current.targetText };
      });
    }, transitionCompletionMs);

    return () => clearTimeout(timeout);
  }, [hasAllMetrics, shouldAnimateTransition, text, transition.id, transitionCompletionMs]);

  if (!canAnimate) {
    return (
      <View
        accessibilityLabel={accessibilityLabel ?? text}
        accessibilityRole="text"
        accessible
        pointerEvents="none"
        style={[animatedTextContainerStyle, containerStyle]}
        testID={testID}
      >
        <Text
          accessible={false}
          allowFontScaling={allowFontScaling}
          className={textClassName}
          ellipsizeMode={resolvedEllipsizeMode}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          numberOfLines={1}
          style={textStyle}
        >
          {text}
        </Text>
      </View>
    );
  }

  const slotCount = hasAllMetrics
    ? Math.max(fromSegments.length, targetSegments.length)
    : fromSegments.length;

  const handleSegmentLayout = (segment: string, event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setSegmentMetrics((current) => {
      const previous = current.get(segment);
      if (previous?.height === height && previous.width === width) {
        return current;
      }

      const next = new Map(current);
      next.set(segment, { height, width });
      return next;
    });
  };

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityRole="text"
      accessible
      pointerEvents="none"
      style={[animatedTextContainerStyle, containerStyle]}
      testID={testID}
    >
      {hasFromMetrics ? (
        Array.from({ length: slotCount }, (_, index) => {
          const currentSegment = fromSegments[index] ?? '';
          const requestedTargetSegment = targetSegments[index] ?? '';
          const targetSegment = hasAllMetrics ? requestedTargetSegment : currentSegment;
          const currentMetrics = segmentMetrics.get(currentSegment);
          const targetMetrics = segmentMetrics.get(targetSegment);
          const height = Math.max(currentMetrics?.height ?? 0, targetMetrics?.height ?? 0);
          const shouldAnimate =
            hasAllMetrics && shouldAnimateTransition && animatedSlotFlags[index];
          const resolvedHighlightColor = targetSegment ? slotTextHighlightColor : undefined;

          return (
            <SlotGlyph
              // Slot identity is positional by design, so the index is the stable key.
              key={index}
              allowFontScaling={allowFontScaling}
              currentSegment={currentSegment}
              currentWidth={currentMetrics?.width ?? 0}
              ellipsizeMode={resolvedEllipsizeMode}
              entryPhaseStartMs={transitionPhaseTiming.entryPhaseStartMs}
              exitPhaseDurationMs={transitionPhaseTiming.exitPhaseDurationMs}
              height={height}
              highlightColor={resolvedHighlightColor}
              index={index}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
              options={resolved.options}
              segmentCount={targetSegments.length}
              shouldAnimate={shouldAnimate}
              targetSegment={targetSegment}
              targetWidth={targetMetrics?.width ?? 0}
              textClassName={textClassName}
              textStyle={textStyle}
              transitionId={transition.id}
            />
          );
        })
      ) : (
        <Text
          accessible={false}
          allowFontScaling={allowFontScaling}
          className={textClassName}
          ellipsizeMode={resolvedEllipsizeMode}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          numberOfLines={1}
          style={textStyle}
        >
          {transition.fromText}
        </Text>
      )}

      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no"
        pointerEvents="none"
        style={measurementLayerStyle}
      >
        {measurementSegments.map((segment) => (
          <Text
            accessible={false}
            allowFontScaling={allowFontScaling}
            className={textClassName}
            ellipsizeMode={resolvedEllipsizeMode}
            key={segment}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            numberOfLines={1}
            onLayout={(event) => handleSegmentLayout(segment, event)}
            style={textStyle}
          >
            {segment === ' ' ? '\u00A0' : segment}
          </Text>
        ))}
      </View>
    </View>
  );
}
