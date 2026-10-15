import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import Minimize2Icon from '@cherrystudio/app-icons/icons/minimize-2';
import PauseIcon from '@cherrystudio/app-icons/icons/pause';
import {
  COMPOSER_MAX_TEXT_HEIGHT,
  Composer,
  useComposerExpansion,
} from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import {
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  type TextStyle,
  View,
} from 'react-native';
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

/** Attachments and the large editor's collapse control share the top row. */
export function ChatInputAccessories({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const expansion = useComposerExpansion();
  const isExpanded = expansion?.state.isExpanded ?? false;
  const progress = expansion?.meta.progress;
  const rowStyle = useAnimatedStyle(() => ({
    minHeight: restingActionSlotWidth * (progress?.get() ?? 0),
    paddingRight: restingActionSlotWidth * (progress?.get() ?? 0),
  }));
  const actionStyle = useAnimatedStyle(() => ({ opacity: progress?.get() ?? 0 }));

  return (
    <Composer.ExpansionMeasure>
      <Animated.View className="relative" style={rowStyle}>
        {children}
        {expansion ? (
          <Animated.View
            accessibilityElementsHidden={!isExpanded}
            className="absolute top-0 right-0 size-8"
            importantForAccessibility={isExpanded ? 'auto' : 'no-hide-descendants'}
            pointerEvents={isExpanded ? 'auto' : 'none'}
            style={actionStyle}
          >
            <Pressable
              accessibilityLabel={t('chat.input.action.collapseEditor')}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              className="flex-1 items-center justify-center"
              hitSlop={6}
              onPress={expansion.actions.collapse}
              testID="chat-composer-collapse"
            >
              <Minimize2Icon className="size-5 text-muted-foreground" />
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Composer.ExpansionMeasure>
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
  const expansion = useComposerExpansion();
  const isExpanded = expansion?.state.isExpanded ?? false;
  const hasFollowUp = onStop !== undefined && hasComposerSendableContent(draft, attachments);
  const isInputActive = isExpanded || isEditing || draft.length > 0 || attachments.length > 0;
  const naturalFieldHeight = useRef(restingInputHeight);
  const activeProgress = useSharedValue(isInputActive ? 1 : 0);
  const fieldFrameHeight = useSharedValue(restingInputHeight);
  const expansionHeight = expansion?.meta.extraHeight;
  const collapseEditor = expansion?.actions.collapse;

  useEffect(() => () => collapseEditor?.(), [collapseEditor]);

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
      height:
        fieldFrameHeight.get() +
        progress * (activeToolbarGap + restingInputHeight) +
        (expansionHeight?.get() ?? 0),
    };
  });
  const fieldFrameStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      height: Math.max(restingInputHeight, fieldFrameHeight.get() + (expansionHeight?.get() ?? 0)),
      left: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
      right: interpolate(progress, [0, 1], [restingActionSlotWidth, 0], Extrapolation.CLAMP),
    };
  });
  const controlsRowStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();

    return {
      transform: [
        {
          translateY:
            progress * (fieldFrameHeight.get() + activeToolbarGap) + (expansionHeight?.get() ?? 0),
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
      const nextHeight = Math.max(
        restingInputHeight,
        Math.min(COMPOSER_MAX_TEXT_HEIGHT, Math.ceil(event.nativeEvent.layout.height)),
      );
      if (naturalFieldHeight.current === nextHeight) {
        return;
      }

      if (expansion?.state.isPresented) {
        expansion.actions.resizeContent(nextHeight - naturalFieldHeight.current);
      }
      naturalFieldHeight.current = nextHeight;
      if (isInputActive) {
        fieldFrameHeight.set(nextHeight);
      }
    },
    [expansion, fieldFrameHeight, isInputActive],
  );
  return (
    <Animated.View className="relative overflow-hidden" style={morphFrameStyle}>
      <Animated.View className="absolute top-0 overflow-hidden" style={fieldFrameStyle}>
        {/* Center a short field in the action row; longer drafts grow naturally. */}
        <View
          className={
            isExpanded ? 'absolute inset-0' : 'absolute top-0 right-0 left-0 justify-center'
          }
          style={FIELD_CONTENT_STYLE}
        >
          <ComposerField
            layout={isExpanded ? 'fill' : 'content'}
            onLayout={isExpanded ? undefined : handleFieldLayout}
            placeholder={placeholder}
            style={
              isExpanded
                ? undefined
                : [fieldStyle, expansion && isInputActive ? fieldActionInsetStyle : undefined]
            }
            attachmentMode={attachmentMode}
            testID="chat-composer-input"
          />
        </View>
      </Animated.View>
      {expansion && isInputActive && !isExpanded ? (
        <Pressable
          accessibilityLabel={t('chat.input.action.expandEditor')}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          className="absolute top-0 right-0 size-8 items-center justify-center"
          hitSlop={6}
          onPress={expansion.actions.expand}
          testID="chat-composer-expand"
        >
          <Maximize2Icon className="size-5 text-muted-foreground" />
        </Pressable>
      ) : null}
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

const fieldActionInsetStyle = { paddingRight: 40 };
