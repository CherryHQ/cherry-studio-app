import { Portal, TextAnimation } from '@cherrystudio/ui/components';
import { easing } from '@cherrystudio/ui/motion';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OverKeyboardView, useKeyboardState } from 'react-native-keyboard-controller';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { EffortSlider } from '../effortSlider';
import {
  type ChatInputEffortFrame,
  type ChatInputEffortOverlayLayout,
  chatInputEffortTrackHeight,
  getChatInputEffortOverlayLayout,
} from '../utils/chatInputEffortLayout';
import type { ChatInputReasoningEffort } from '../utils/chatInputReasoning';
import { getChatInputReasoningEffortOption } from '../utils/chatInputReasoning';
import { ChatInputEffortBackdrop } from './ChatInputEffortBackdrop/ChatInputEffortBackdrop';
import { ChatInputEffortGauge } from './ChatInputEffortGauge';

const openDurationMs = 150;
const closeDurationMs = 120;

type ActiveEffortLayout = ChatInputEffortOverlayLayout & {
  keyboardHeight: number;
  keyboardVisible: boolean;
  viewportHeight: number;
  viewportWidth: number;
};

type ChatInputEffortOverlayProps = {
  children: (gauge: ReactNode) => ReactNode;
  modelLabel?: string;
  onChange: (value: ChatInputReasoningEffort) => void;
  reasoningEffort: ChatInputReasoningEffort;
  reasoningEfforts: readonly ChatInputReasoningEffort[];
};

/** Floats a gauge-anchored effort slider over the still-mounted composer. */
export function ChatInputEffortOverlay({
  children,
  modelLabel,
  onChange,
  reasoningEffort,
  reasoningEfforts,
}: ChatInputEffortOverlayProps) {
  const { t } = useTranslation();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const keyboard = useKeyboardState((state) => ({
    appearance: state.appearance,
    height: state.height,
    isVisible: state.isVisible,
  }));
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const rootRef = useRef<View>(null);
  const openingRef = useRef(false);
  const [layout, setLayout] = useState<ActiveEffortLayout | null>(null);
  const portalName = useId();
  const scrimColor = useThemeColor('constant-black');
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
    if (!layout) {
      return;
    }

    if (reducedMotion) {
      progress.set(0);
      setLayout(null);
      return;
    }

    progress.set(
      withTiming(0, { duration: closeDurationMs, easing: easing.settle }, (finished) => {
        if (finished) {
          runOnJS(setLayout)(null);
        }
      }),
    );
  }, [layout, progress, reducedMotion]);

  const open = useCallback(
    (gaugeFrame: ChatInputEffortFrame) => {
      if (layout || openingRef.current || reasoningEfforts.length === 0) {
        return;
      }

      const root = rootRef.current;
      if (!root) {
        return;
      }

      openingRef.current = true;
      root.measureInWindow((left, top, width, height) => {
        openingRef.current = false;
        const nextLayout = getChatInputEffortOverlayLayout(
          { height, left, top, width },
          gaugeFrame,
          { height: viewportHeight, left: 0, top: 0, width: viewportWidth },
        );
        if (!nextLayout) {
          return;
        }

        progress.set(reducedMotion ? 1 : 0);
        setLayout({
          ...nextLayout,
          keyboardHeight: keyboard.height,
          keyboardVisible: keyboard.isVisible,
          viewportHeight,
          viewportWidth,
        });
        if (!reducedMotion) {
          requestAnimationFrame(() => {
            progress.set(withTiming(1, { duration: openDurationMs, easing: easing.settle }));
          });
        }
      });
    },
    [
      keyboard.height,
      keyboard.isVisible,
      layout,
      progress,
      reasoningEfforts.length,
      reducedMotion,
      viewportHeight,
      viewportWidth,
    ],
  );

  useEffect(() => {
    if (!layout) {
      return;
    }

    const viewportChanged =
      layout.viewportHeight !== viewportHeight || layout.viewportWidth !== viewportWidth;
    const keyboardChanged =
      layout.keyboardVisible !== keyboard.isVisible ||
      (layout.keyboardVisible && Math.abs(layout.keyboardHeight - keyboard.height) > 1);
    if (viewportChanged || keyboardChanged) {
      const closeFrame = requestAnimationFrame(close);
      return () => cancelAnimationFrame(closeFrame);
    }

    return undefined;
  }, [close, keyboard.height, keyboard.isVisible, layout, viewportHeight, viewportWidth]);

  const handleChange = useCallback(
    (value: string) => onChange(value as ChatInputReasoningEffort),
    [onChange],
  );
  const gaugeFrame = layout?.gaugeFrame ?? emptyFrame;
  const sliderFrame = layout?.sliderFrame ?? emptyFrame;
  const sliderStyle = useAnimatedStyle(() => ({
    height: interpolate(
      progress.value,
      [0, 1],
      [gaugeFrame.height, sliderFrame.height],
      Extrapolation.CLAMP,
    ),
    left: interpolate(
      progress.value,
      [0, 1],
      [gaugeFrame.left, sliderFrame.left],
      Extrapolation.CLAMP,
    ),
    top: interpolate(
      progress.value,
      [0, 1],
      [gaugeFrame.top, sliderFrame.top],
      Extrapolation.CLAMP,
    ),
    width: interpolate(
      progress.value,
      [0, 1],
      [gaugeFrame.width, sliderFrame.width],
      Extrapolation.CLAMP,
    ),
  }));
  const labelStyle = useAnimatedStyle(() => {
    const reveal = interpolate(progress.value, [0.58, 1], [0, 1], Extrapolation.CLAMP);

    return { opacity: reveal, transform: [{ translateY: 5 * (1 - reveal) }] };
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
  const keyboardOverlayVisible = Boolean(layout?.keyboardVisible && layout.keyboardHeight > 0);
  const overlayControls = layout ? (
    <>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={close}
        style={{
          height: viewportHeight,
          left: 0,
          position: 'absolute',
          top: 0,
          width: viewportWidth,
          zIndex: 1,
        }}
        testID={
          keyboardOverlayVisible
            ? 'chat-input-effort-keyboard-backdrop'
            : 'chat-input-effort-backdrop'
        }
      />

      <Animated.View style={[sliderContainerStyle, sliderStyle]} testID="chat-input-effort-slider">
        <EffortSlider
          accessibilityLabel={t('chat.reasoning.title')}
          onChange={handleChange}
          options={options}
          testID="chat-input-effort-slider-control"
          value={reasoningEffort}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[labelContainerStyle, layout.labelFrame, labelStyle]}
      >
        <TextAnimation.Rotating
          ellipsizeMode="tail"
          numberOfLines={1}
          text={displayLabel}
          textClassName="text-center font-semibold text-foreground text-base"
          testID="chat-input-effort-label"
        />
      </Animated.View>
    </>
  ) : null;

  return (
    <>
      <View
        ref={rootRef}
        accessibilityElementsHidden={Boolean(layout)}
        collapsable={false}
        importantForAccessibility={layout ? 'no-hide-descendants' : 'auto'}
        testID="chat-input-effort-morph"
      >
        {children(gauge)}
      </View>

      {layout ? (
        <Portal name={`chat-input-effort-${portalName}`}>
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            pointerEvents={keyboardOverlayVisible ? 'none' : 'box-none'}
            style={StyleSheet.absoluteFill}
          >
            <ChatInputEffortBackdrop progress={progress} scrimColor={scrimColor} variant="app" />
            {keyboardOverlayVisible ? null : overlayControls}
          </View>
        </Portal>
      ) : null}

      <OverKeyboardView visible={keyboardOverlayVisible}>
        {/* Reparenting into the keyboard window requires a gesture root in that window. */}
        <GestureHandlerRootView
          accessibilityViewIsModal
          collapsable={false}
          onAccessibilityEscape={close}
          pointerEvents="box-none"
          style={{ height: viewportHeight, position: 'absolute', width: viewportWidth }}
        >
          <View
            pointerEvents="none"
            style={[keyboardBackdropContainerStyle, { height: layout?.keyboardHeight ?? 0 }]}
          >
            <ChatInputEffortBackdrop
              progress={progress}
              scrimColor={scrimColor}
              tint={keyboard.appearance}
              variant="keyboard"
            />
          </View>
          {keyboardOverlayVisible ? overlayControls : null}
        </GestureHandlerRootView>
      </OverKeyboardView>
    </>
  );
}

const emptyFrame: ChatInputEffortFrame = { height: 0, left: 0, top: 0, width: 0 };
const sliderContainerStyle = {
  borderRadius: chatInputEffortTrackHeight / 2,
  justifyContent: 'center',
  overflow: 'hidden',
  position: 'absolute',
  zIndex: 2,
} as const;
const labelContainerStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  position: 'absolute',
  zIndex: 2,
} as const;
const keyboardBackdropContainerStyle = {
  bottom: 0,
  left: 0,
  position: 'absolute',
  right: 0,
} as const;
