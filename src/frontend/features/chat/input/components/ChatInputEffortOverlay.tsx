import { REASONING_EFFORT } from '@cherrystudio/provider-registry';
import { Portal, Surface } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { type ReactNode, useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { useComposerFieldDismiss } from '@/frontend/components/composer';
import { SlotText } from '@/frontend/components/SlotText';

import { EffortSlider } from '../effortSlider';
import type { ChatInputReasoningEffort } from '../utils/chatInputReasoning';
import { getChatInputReasoningEffortOption } from '../utils/chatInputReasoning';
import { ChatInputEffortGauge } from './ChatInputEffortGauge';

const openHeight = 48;
const surfaceRadius = openHeight / 2;
const labelGap = 10;
const labelHeight = 20;
const slideDistance = 20;
const restingScale = 0.98;

type EffortSliderAnchor = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type ChatInputEffortOverlayProps = {
  children: (gauge: ReactNode) => ReactNode;
  modelLabel?: string;
  onChange: (value: ChatInputReasoningEffort) => void;
  reasoningEffort: ChatInputReasoningEffort;
  reasoningEfforts: readonly ChatInputReasoningEffort[];
};

/** Morphs the live composer into its effort slider without moving draft state. */
export function ChatInputEffortOverlay({
  children,
  modelLabel,
  onChange,
  reasoningEffort,
  reasoningEfforts,
}: ChatInputEffortOverlayProps) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const dismissField = useComposerFieldDismiss();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const closedHeight = useSharedValue(openHeight);
  const rootRef = useRef<View>(null);
  const openingRef = useRef(false);
  const [anchor, setAnchor] = useState<EffortSliderAnchor | null>(null);
  const portalName = useId();
  const fieldMaterial = useResolveClassNames('bg-field');
  const options = useMemo(
    () =>
      reasoningEfforts.map((value) => ({
        label: t(getChatInputReasoningEffortOption(value)?.labelKey ?? value),
        value,
      })),
    [reasoningEfforts, t],
  );
  const valueIndex = Math.max(
    0,
    options.findIndex((option) => option.value === reasoningEffort),
  );
  const currentLabel = options[valueIndex]?.label ?? '';
  const displayLabel = `${modelLabel ?? t('chat.model.select')} ${currentLabel}`.trim();

  const close = useCallback(() => {
    if (!anchor) {
      return;
    }

    if (reducedMotion) {
      progress.set(0);
      setAnchor(null);
      return;
    }

    progress.set(
      withTiming(0, { duration: duration.base, easing: easing.settle }, (finished) => {
        if (finished) {
          runOnJS(setAnchor)(null);
        }
      }),
    );
  }, [anchor, progress, reducedMotion]);

  const open = useCallback(() => {
    if (anchor || openingRef.current || reasoningEfforts.length === 0) {
      return;
    }

    openingRef.current = true;
    void dismissField().finally(() => {
      requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) {
          openingRef.current = false;
          return;
        }

        root.measureInWindow((x, y, width, height) => {
          openingRef.current = false;
          if (width <= 0 || height <= 0) {
            return;
          }

          closedHeight.set(height);
          progress.set(
            reducedMotion ? 1 : withTiming(1, { duration: duration.slow, easing: easing.settle }),
          );
          setAnchor({ height: openHeight, left: x, top: y + height - openHeight, width });
        });
      });
    });
  }, [anchor, closedHeight, dismissField, progress, reasoningEfforts.length, reducedMotion]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!anchor) {
        closedHeight.set(event.nativeEvent.layout.height);
      }
    },
    [anchor, closedHeight],
  );
  const handleChange = useCallback(
    (value: string) => onChange(value as ChatInputReasoningEffort),
    [onChange],
  );

  const containerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [closedHeight.value, openHeight]),
  }));
  const composerStyle = useAnimatedStyle(() => {
    const swap = interpolate(progress.value, [0, 0.58], [0, 1], Extrapolation.CLAMP);

    return {
      opacity: 1 - swap,
      transform: [{ translateX: -slideDistance * swap }, { scale: 1 - (1 - restingScale) * swap }],
    };
  });
  const sliderStyle = useAnimatedStyle(() => {
    const swap = interpolate(progress.value, [0.22, 1], [0, 1], Extrapolation.CLAMP);

    return {
      opacity: swap,
      transform: [
        { translateX: slideDistance * (1 - swap) },
        { scale: restingScale + (1 - restingScale) * swap },
      ],
    };
  });
  const labelStyle = useAnimatedStyle(() => {
    const reveal = interpolate(progress.value, [0.42, 1], [0, 1], Extrapolation.CLAMP);

    return {
      opacity: reveal,
      transform: [{ translateY: 6 * (1 - reveal) }],
    };
  });

  const gauge =
    options.length > 0 ? (
      <ChatInputEffortGauge
        accessibilityLabel={`${t('chat.reasoning.title')}: ${currentLabel}`}
        onPress={open}
        stopCount={options.length}
        valueIndex={valueIndex}
      />
    ) : null;

  return (
    <>
      <Animated.View
        ref={rootRef}
        onLayout={handleLayout}
        style={[rootStyle, anchor ? containerStyle : undefined, anchor ? clippedStyle : undefined]}
        testID="chat-input-effort-morph"
      >
        <Animated.View pointerEvents={anchor ? 'none' : 'auto'} style={composerStyle}>
          {children(gauge)}
        </Animated.View>

        <Animated.View
          pointerEvents={anchor ? 'auto' : 'none'}
          style={[sliderLayerStyle, sliderStyle]}
          testID="chat-input-effort-slider"
        >
          <Surface
            className="bg-field ios:shadow-field android:shadow-sm"
            cornerRadius={surfaceRadius}
            style={sliderSurfaceStyle}
            tintColor={
              typeof fieldMaterial.backgroundColor === 'string'
                ? fieldMaterial.backgroundColor
                : undefined
            }
          >
            <EffortSlider
              accessibilityLabel={t('chat.reasoning.title')}
              onChange={handleChange}
              options={options}
              pixelFieldValue={REASONING_EFFORT.MAX}
              testID="chat-input-effort-slider-control"
              value={reasoningEffort}
            />
          </Surface>
        </Animated.View>
      </Animated.View>

      {anchor ? (
        <Portal name={`chat-input-effort-${portalName}`}>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={close}
              style={[backdropStyle, { height: Math.max(anchor.top, 0), top: 0 }]}
              testID="chat-input-effort-backdrop"
            />
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={close}
              style={[
                backdropStyle,
                {
                  bottom: 0,
                  top: Math.min(anchor.top + anchor.height, windowHeight),
                },
              ]}
            />
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={close}
              style={[
                sideBackdropStyle,
                { height: anchor.height, top: anchor.top, width: Math.max(anchor.left, 0) },
              ]}
            />
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onPress={close}
              style={[
                sideBackdropStyle,
                {
                  height: anchor.height,
                  left: anchor.left + anchor.width,
                  right: 0,
                  top: anchor.top,
                },
              ]}
            />

            <Animated.View
              pointerEvents="none"
              style={[
                labelContainerStyle,
                {
                  left: anchor.left,
                  top: anchor.top - labelGap - labelHeight,
                  width: anchor.width,
                },
                labelStyle,
              ]}
            >
              <SlotText
                ellipsizeMode="tail"
                text={displayLabel}
                textClassName="text-center font-semibold text-foreground text-sm"
                testID="chat-input-effort-label"
              />
            </Animated.View>
          </View>
        </Portal>
      ) : null}
    </>
  );
}

const rootStyle = {
  justifyContent: 'flex-end',
  overflow: 'visible',
  position: 'relative',
} as const;
const clippedStyle = { borderRadius: surfaceRadius, overflow: 'hidden' } as const;
const sliderLayerStyle = {
  bottom: 0,
  height: openHeight,
  left: 0,
  position: 'absolute',
  right: 0,
} as const;
const sliderSurfaceStyle = {
  height: openHeight,
  justifyContent: 'center',
  paddingHorizontal: 8,
  width: '100%',
} as const;
const backdropStyle = { left: 0, position: 'absolute', right: 0 } as const;
const sideBackdropStyle = { left: 0, position: 'absolute' } as const;
const labelContainerStyle = {
  alignItems: 'center',
  height: labelHeight,
  justifyContent: 'center',
  position: 'absolute',
} as const;
