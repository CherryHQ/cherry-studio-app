import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { type ComponentProps, type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, type StyleProp, type TextStyle, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  ComposerField,
  ComposerSurface,
  useComposerPresentationState,
  useComposerState,
} from '@/frontend/components/Composer';
import { hasComposerSendableContent } from '@/frontend/components/Composer/utils/composerAttachments';

const restingInputHeight = 32;
const FIELD_CONTENT_STYLE = { minHeight: restingInputHeight };
const restingActionSlotWidth = restingInputHeight + 8;
const restingSecondaryControlScale = 0.92;
const activeToolbarGap = 16;
const activeTransitionMotion = {
  duration: duration.base,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

/** A drafted follow-up can be admitted while Pi continues its current answer. */
export function ChatInputComposer(props: ComponentProps<typeof ComposerSurface>) {
  const { attachments, draft } = useComposerState();
  return (
    <ComposerSurface
      {...props}
      streaming={props.streaming && !hasComposerSendableContent(draft, attachments)}
    />
  );
}

export function ChatInputSurface({
  leadingAction,
  secondaryAction,
  trailingAction,
  streaming,
  onStop,
  fieldStyle,
  placeholder,
  attachmentMode = 'images',
}: {
  leadingAction?: ReactNode;
  secondaryAction?: ReactNode;
  trailingAction?: ReactNode;
  streaming: boolean;
  onStop?: () => void;
  fieldStyle?: StyleProp<TextStyle>;
  placeholder?: string;
  attachmentMode?: 'images' | 'text-only';
}) {
  const { t } = useTranslation();
  const { isEditing } = useComposerPresentationState();
  const { attachments, draft } = useComposerState();
  const hasFollowUp = onStop !== undefined && hasComposerSendableContent(draft, attachments);
  const isInputActive = isEditing || draft.length > 0 || attachments.length > 0;
  const naturalFieldHeight = useRef(restingInputHeight);
  const activeProgress = useSharedValue(isInputActive ? 1 : 0);
  const fieldFrameHeight = useSharedValue(restingInputHeight);

  useEffect(() => {
    activeProgress.set(withTiming(isInputActive ? 1 : 0, activeTransitionMotion));
    fieldFrameHeight.set(
      withTiming(
        isInputActive ? naturalFieldHeight.current : restingInputHeight,
        activeTransitionMotion,
      ),
    );
  }, [activeProgress, fieldFrameHeight, isInputActive]);

  const morphFrameStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      height: fieldFrameHeight.get() + progress * (activeToolbarGap + restingInputHeight),
    };
  });
  const fieldFrameStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      height: fieldFrameHeight.get(),
      left: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
      right: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
    };
  });
  const controlsRowStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      transform: [
        {
          translateY: progress * (fieldFrameHeight.get() + activeToolbarGap),
        },
      ],
    };
  });
  // Keep GlassView's backdrop sampling intact: Reanimated opacity on an
  // ancestor writes a layer alpha that permanently strips the tools' fill.
  // The closed frame clips these controls after translation instead.
  const secondaryControlRevealStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      transform: [
        { translateY: (1 - progress) * restingInputHeight },
        {
          scale: interpolate(
            progress,
            [0, 1],
            [restingSecondaryControlScale, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const handleFieldLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.max(restingInputHeight, Math.ceil(event.nativeEvent.layout.height));
      if (naturalFieldHeight.current === nextHeight) {
        return;
      }

      naturalFieldHeight.current = nextHeight;
      if (isInputActive) {
        fieldFrameHeight.set(nextHeight);
      }
    },
    [fieldFrameHeight, isInputActive],
  );
  return (
    <Animated.View className="relative overflow-hidden" style={morphFrameStyle}>
      <Animated.View className="absolute top-0 overflow-hidden" style={fieldFrameStyle}>
        {/* Center a short field in the action row; longer drafts grow naturally. */}
        <View
          className="absolute top-0 right-0 left-0 justify-center"
          onLayout={handleFieldLayout}
          style={FIELD_CONTENT_STYLE}
        >
          <ComposerField
            placeholder={placeholder}
            style={fieldStyle}
            attachmentMode={attachmentMode}
            testID="chat-composer-input"
          />
        </View>
      </Animated.View>
      <Animated.View
        className="absolute top-0 right-0 left-0 flex-row items-center gap-2"
        pointerEvents="box-none"
        style={controlsRowStyle}
      >
        {/* The primary actions stay reachable while the field is empty and unfocused. */}
        {leadingAction ?? <View style={{ width: restingInputHeight }} />}
        <Animated.View
          accessibilityElementsHidden={!isInputActive}
          className="min-w-0 shrink"
          importantForAccessibility={isInputActive ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isInputActive ? 'auto' : 'none'}
          style={secondaryControlRevealStyle}
        >
          {secondaryAction}
        </Animated.View>
        <View className="ml-auto flex-row items-center gap-2" pointerEvents="box-none">
          {trailingAction ? (
            <Animated.View
              accessibilityElementsHidden={!isInputActive}
              importantForAccessibility={isInputActive ? 'auto' : 'no-hide-descendants'}
              pointerEvents={isInputActive ? 'auto' : 'none'}
              style={secondaryControlRevealStyle}
            >
              {trailingAction}
            </Animated.View>
          ) : null}
          {streaming && hasFollowUp && onStop ? (
            <Composer.Action
              accessibilityLabel={t('chat.input.action.stopGenerating')}
              className="bg-transparent"
              onPress={onStop}
              testID="chat-composer-stop"
            >
              <PauseIcon className="size-6 text-foreground" />
            </Composer.Action>
          ) : null}
          <Composer.Send
            testID={streaming && !hasFollowUp ? 'chat-composer-stop' : 'chat-composer-send'}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
