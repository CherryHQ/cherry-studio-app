import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import Minimize2Icon from '@cherrystudio/app-icons/icons/minimize-2';
import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { easing } from '../../../motion';
import type { ComposerInputProps } from '../composer.types';
import { composerActionSize, COMPOSER_MAX_TEXT_HEIGHT } from '../utils/composer-layout';
import { ComposerExpansionMeasure, useComposerExpansion } from './composer-expansion';

const restingInputHeight = composerActionSize;
const fieldContentStyle = { minHeight: restingInputHeight };
const restingActionSlotWidth = restingInputHeight + 8;
const activeToolbarGap = 16;
const fieldActionInsetStyle = { paddingRight: restingActionSlotWidth };
// Shorter than the keyboard on purpose: the editor finishes its shape early in the keyboard's
// travel, so the transcript reads one motion with a small early growth instead of two
// overlapping ones. Interruptions reverse it; Reduce Motion lands directly.
const activeTransitionMotion = {
  duration: 90,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

type EditorContextValue = {
  state: { active: boolean; isExpanded: boolean; canExpand: boolean };
  meta: { progress: SharedValue<number> };
};

const EditorContext = createContext<EditorContextValue | null>(null);

/**
 * The compact-to-editing layout shared by input contexts. The caller supplies
 * its native field and composes the toolbar as children.
 * The same field stays mounted through editing and manual expansion.
 */
export function ComposerEditor({
  active,
  activeSignal,
  children,
  compactAccessory,
  expandLabel,
  field,
  testID,
}: PropsWithChildren<{
  active: boolean;
  /**
   * Raises `active` on the UI thread before React commits, so the shape change starts with the
   * keyboard rather than a render later. Deactivation still follows `active`.
   */
  activeSignal?: SharedValue<boolean>;
  /** One action-sized preview beside the resting field; its presence never activates editing. */
  compactAccessory?: ReactNode;
  expandLabel: string;
  field: ReactNode;
  testID?: string;
}>) {
  const expansion = useComposerExpansion();
  const isExpanded = expansion?.state.isExpanded ?? false;
  const isInputActive = active || isExpanded;
  const naturalFieldHeight = useSharedValue(restingInputHeight);
  const morphTarget = useSharedValue(isInputActive);
  const activeProgress = useSharedValue(isInputActive ? 1 : 0);
  const fieldFrameHeight = useSharedValue(restingInputHeight);
  const expansionHeight = expansion?.meta.extraHeight;
  const collapseEditor = expansion?.actions.collapse;
  const canExpand = expansion !== null;
  const hasCompactAccessory = compactAccessory != null;
  const context = useMemo(
    () => ({
      state: { active: isInputActive, isExpanded, canExpand },
      meta: { progress: activeProgress },
    }),
    [activeProgress, canExpand, isExpanded, isInputActive],
  );

  useEffect(() => () => collapseEditor?.(), [collapseEditor]);

  // The top grows away from the anchored toolbar. Whichever of the signal and the
  // committed state arrives first starts the motion; the other finds it running.
  const morphTo = useCallback(
    (target: boolean) => {
      'worklet';
      if (morphTarget.get() === target) return;
      morphTarget.set(target);
      activeProgress.set(withTiming(target ? 1 : 0, activeTransitionMotion));
      fieldFrameHeight.set(
        withTiming(target ? naturalFieldHeight.get() : restingInputHeight, activeTransitionMotion),
      );
    },
    [activeProgress, fieldFrameHeight, morphTarget, naturalFieldHeight],
  );
  useEffect(() => morphTo(isInputActive), [isInputActive, morphTo]);
  useAnimatedReaction(
    () => activeSignal?.get() ?? false,
    (raised) => morphTo(raised || isInputActive),
    [activeSignal, isInputActive, morphTo],
  );

  const morphFrameStyle = useAnimatedStyle(() => ({
    height:
      fieldFrameHeight.get() +
      activeProgress.get() * (activeToolbarGap + restingInputHeight) +
      (expansionHeight?.get() ?? 0),
  }));
  const fieldFrameStyle = useAnimatedStyle(() => ({
    height: Math.max(restingInputHeight, fieldFrameHeight.get() + (expansionHeight?.get() ?? 0)),
    left: interpolate(
      activeProgress.get(),
      [0, 1],
      [restingActionSlotWidth * (hasCompactAccessory ? 2 : 1), 0],
      Extrapolation.CLAMP,
    ),
    right: interpolate(
      activeProgress.get(),
      [0, 1],
      [restingActionSlotWidth, 0],
      Extrapolation.CLAMP,
    ),
  }));
  const controlsRowStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          activeProgress.get() * (fieldFrameHeight.get() + activeToolbarGap) +
          (expansionHeight?.get() ?? 0),
      },
    ],
  }));
  const compactAccessoryStyle = useAnimatedStyle(() => ({ opacity: 1 - activeProgress.get() }));
  const handleFieldLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.max(
        restingInputHeight,
        Math.min(COMPOSER_MAX_TEXT_HEIGHT, Math.ceil(event.nativeEvent.layout.height)),
      );
      const previousHeight = naturalFieldHeight.get();
      if (previousHeight === nextHeight) return;
      if (expansion?.state.isPresented) {
        expansion.actions.resizeContent(nextHeight - previousHeight);
      }
      naturalFieldHeight.set(nextHeight);
      if (isInputActive) fieldFrameHeight.set(nextHeight);
    },
    [expansion, fieldFrameHeight, isInputActive, naturalFieldHeight],
  );

  return (
    <EditorContext value={context}>
      <Animated.View className="relative overflow-hidden" style={morphFrameStyle}>
        <Animated.View className="absolute top-0 overflow-hidden" style={fieldFrameStyle}>
          <View
            className={
              isExpanded ? 'absolute inset-0' : 'absolute top-0 right-0 left-0 justify-center'
            }
            onLayout={isExpanded ? undefined : handleFieldLayout}
            style={fieldContentStyle}
          >
            {field}
          </View>
        </Animated.View>
        {hasCompactAccessory ? (
          <Animated.View
            accessibilityElementsHidden={isInputActive}
            className="absolute top-0 size-8"
            importantForAccessibility={isInputActive ? 'no-hide-descendants' : 'auto'}
            pointerEvents={isInputActive ? 'none' : 'auto'}
            style={[{ left: restingActionSlotWidth }, compactAccessoryStyle]}
          >
            {compactAccessory}
          </Animated.View>
        ) : null}
        {expansion && isInputActive && !isExpanded ? (
          <Pressable
            accessibilityLabel={expandLabel}
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            className="absolute top-0 right-0 size-8 items-center justify-center"
            hitSlop={6}
            onPress={expansion.actions.expand}
            testID={testID}
          >
            <Maximize2Icon className="size-5 text-muted-foreground" />
          </Pressable>
        ) : null}
        <Animated.View
          className="absolute top-0 right-0 left-0 flex-row items-center gap-2"
          pointerEvents="box-none"
          style={controlsRowStyle}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </EditorContext>
  );
}

/** Optional field layout for adapters that add app-specific paste or rich-text behavior. */
export function useComposerEditorInput(): Pick<ComposerInputProps, 'layout' | 'style'> | null {
  const context = use(EditorContext);
  if (!context) return null;
  const { active, isExpanded, canExpand } = context.state;
  return {
    layout: isExpanded ? 'fill' : 'content',
    style: !isExpanded && active && canExpand ? fieldActionInsetStyle : undefined,
  };
}

/** Reveal secondary tools without fading ancestors of native glass controls. */
export function ComposerEditorSecondary({ children }: PropsWithChildren) {
  const context = use(EditorContext);
  if (!context) throw new Error('Composer.EditorSecondary requires Composer.Editor');
  const { active } = context.state;
  const { progress } = context.meta;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.get()) * restingInputHeight },
      { scale: interpolate(progress.get(), [0, 1], [0.92, 1], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      className="min-w-0 shrink"
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      pointerEvents={active ? 'auto' : 'none'}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Attachments and the large editor's collapse action share the top row. */
export function ComposerEditorAccessories({
  children,
  collapseLabel,
  testID,
}: PropsWithChildren<{ collapseLabel: string; testID?: string }>) {
  const expansion = useComposerExpansion();
  const isExpanded = expansion?.state.isExpanded ?? false;
  const progress = expansion?.meta.progress;
  const rowStyle = useAnimatedStyle(() => ({
    minHeight: restingActionSlotWidth * (progress?.get() ?? 0),
    paddingRight: restingActionSlotWidth * (progress?.get() ?? 0),
  }));
  const actionStyle = useAnimatedStyle(() => ({ opacity: progress?.get() ?? 0 }));
  return (
    <ComposerExpansionMeasure>
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
              accessibilityLabel={collapseLabel}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              className="flex-1 items-center justify-center"
              hitSlop={6}
              onPress={expansion.actions.collapse}
              testID={testID}
            >
              <Minimize2Icon className="size-5 text-muted-foreground" />
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    </ComposerExpansionMeasure>
  );
}
