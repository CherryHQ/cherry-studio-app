import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BackHandler, type LayoutChangeEvent, View } from 'react-native';
import {
  KeyboardController,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, {
  type DerivedValue,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '../../../motion';
import { getComposerKeyboardStickyOffset } from '../utils/composer-dock-layout';

/** The editor's settled height above its resting row, as the content behind it should see it. */
export type ComposerEditorGrowth = {
  height: number;
  isActive: boolean;
  /** False while the editor's own frame is still moving toward `height`. */
  isSettled: boolean;
};

type ComposerExpansionContextValue = {
  state: { isExpanded: boolean; isPresented: boolean };
  actions: {
    expand: () => void;
    collapse: () => void;
    resizeContent: (delta: number) => void;
    recordDockHeight: (height: number) => void;
    releaseDock: () => void;
    reportEditorGrowth: (growth: ComposerEditorGrowth | null) => void;
  };
  meta: {
    progress: SharedValue<number>;
    extraHeight: SharedValue<number>;
    compactDockHeight: SharedValue<number>;
    /**
     * Space reserved for the resting dock plus the editor's settled growth, which arrives on the
     * keyboard's curve. Held steady during manual expansion.
     */
    contentInset: DerivedValue<number>;
    keyboardTrackingEnabled: SharedValue<boolean>;
  };
};

/** Editor room handed to the content while the keyboard travels from `start` to `end`. */
type ContentGrowthTransition = { end: number; from: number; start: number; to: number };

// A software keyboard starts moving well within this after focus; past it, none is coming.
const keyboardStartTimeout = 400;
const contentGrowthMotion = {
  duration: duration.base,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

const ComposerExpansionContext = createContext<ComposerExpansionContextValue | null>(null);

/** One screen-local expansion. Children and the native editor never change hosts. */
export function ComposerExpansion({ children }: PropsWithChildren) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPresented, setIsPresented] = useState(false);
  const expandedTarget = useRef(false);
  const viewportHeight = useSharedValue(0);
  const compactDockHeight = useSharedValue(0);
  const restingInset = useSharedValue(0);
  const contentGrowth = useSharedValue(0);
  const contentInset = useDerivedValue(() => restingInset.get() + contentGrowth.get());
  const editorGrowth = useSharedValue<Omit<ComposerEditorGrowth, 'isSettled'> | null>(null);
  const growthTransition = useSharedValue<ContentGrowthTransition | null>(null);
  const dockHeight = useRef(0);
  const editor = useRef<ComposerEditorGrowth | null>(null);
  const keyboardTrackingEnabled = useSharedValue(false);
  const progress = useSharedValue(0);
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const { bottom, top } = useSafeAreaInsets();
  const keyboardOffset = getComposerKeyboardStickyOffset(bottom);

  const extraHeight = useDerivedValue(() => {
    const keyboardTranslation = keyboardTrackingEnabled.get()
      ? keyboardHeight.get() + keyboardProgress.get() * keyboardOffset
      : 0;
    const availableHeight = viewportHeight.get() - top - 12 + keyboardTranslation;
    return Math.max(0, availableHeight - compactDockHeight.get()) * progress.get();
  });

  const expand = useCallback(() => {
    expandedTarget.current = true;
    setIsPresented(true);
    setIsExpanded(true);
  }, []);
  const collapse = useCallback(() => {
    expandedTarget.current = false;
    setIsExpanded(false);
  }, []);
  const finishCollapse = useCallback(() => {
    if (!expandedTarget.current) setIsPresented(false);
  }, []);
  const resizeContent = useCallback(
    (delta: number) => {
      compactDockHeight.set((height) => Math.max(0, height + delta));
    },
    [compactDockHeight],
  );

  // The resting inset is the dock without the editor's growth. Read only while the
  // editor is settled, so a measured frame of its morph never reaches the content.
  const syncRestingInset = useCallback(() => {
    if (editor.current?.isSettled === false) return;
    restingInset.set(Math.max(0, dockHeight.current - (editor.current?.height ?? 0)));
  }, [restingInset]);
  const recordDockHeight = useCallback(
    (height: number) => {
      dockHeight.current = height;
      compactDockHeight.set(height);
      syncRestingInset();
    },
    [compactDockHeight, syncRestingInset],
  );
  const releaseDock = useCallback(() => {
    dockHeight.current = 0;
    compactDockHeight.set(0);
    restingInset.set(0);
  }, [compactDockHeight, restingInset]);
  const reportEditorGrowth = useCallback(
    (growth: ComposerEditorGrowth | null) => {
      const previous = editor.current;
      editor.current = growth;
      if (growth?.height !== previous?.height || growth?.isActive !== previous?.isActive) {
        editorGrowth.set(growth && { height: growth.height, isActive: growth.isActive });
      }
      // Growth reaches the dock's measurement a frame later; only a settling editor
      // or the first report reads the dock it already shares.
      if (growth?.isSettled && previous?.isSettled !== true) syncRestingInset();
    },
    [editorGrowth, syncRestingInset],
  );

  // The content gives the editor its room on the keyboard's own curve, so focus moves
  // the transcript once instead of once per animation. Without a keyboard on its way,
  // the room follows the editor's timing.
  useAnimatedReaction(
    () => editorGrowth.get(),
    (next, previous) => {
      const rideKeyboard = (nextTransition: ContentGrowthTransition) => {
        growthTransition.set(nextTransition);
        // Held until the keyboard moves; a keyboard that never starts hands the room to timing.
        contentGrowth.set(
          withDelay(
            keyboardStartTimeout,
            withTiming(nextTransition.to, contentGrowthMotion, (finished) => {
              if (finished) growthTransition.set(null);
            }),
          ),
        );
      };
      const transition = growthTransition.get();
      if (!next) {
        growthTransition.set(null);
        contentGrowth.set(0);
      } else if (previous && next.isActive !== previous.isActive) {
        const start = keyboardProgress.get();
        const end = next.isActive ? 1 : 0;
        if (keyboardTrackingEnabled.get() && start !== end) {
          rideKeyboard({ end, from: contentGrowth.get(), start, to: next.height });
        } else {
          growthTransition.set(null);
          contentGrowth.set(withTiming(next.height, contentGrowthMotion));
        }
      } else if (transition) {
        // Content growth during the ride lands where the keyboard does.
        if (keyboardProgress.get() === transition.start) {
          rideKeyboard({ ...transition, to: next.height });
        } else {
          growthTransition.set({ ...transition, to: next.height });
        }
      } else {
        contentGrowth.set(next.height);
      }
    },
  );
  useAnimatedReaction(
    () => keyboardProgress.get(),
    (current) => {
      const transition = growthTransition.get();
      if (!transition || current === transition.start) return;
      const { end, from, start, to } = transition;
      const remaining = Math.min(1, Math.max(0, (current - end) / (start - end)));
      contentGrowth.set(to + (from - to) * remaining);
      if (current === end) growthTransition.set(null);
    },
  );

  // A second action reverses the current motion. Keep the screen isolated until
  // the close lands; reduced motion lands directly on the complete compact UI.
  useEffect(() => {
    if (!isPresented) return;
    progress.set(
      withTiming(
        isExpanded ? 1 : 0,
        { duration: duration.base, easing: easing.settle, reduceMotion: ReduceMotion.System },
        (finished) => {
          if (finished && !isExpanded) scheduleOnRN(finishCollapse);
        },
      ),
    );
  }, [finishCollapse, isExpanded, isPresented, progress]);

  useEffect(() => {
    if (!isExpanded) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (KeyboardController.isVisible()) void KeyboardController.dismiss();
      else collapse();
      return true;
    });
    return () => back.remove();
  }, [collapse, isExpanded]);

  const value = useMemo(
    () => ({
      state: { isExpanded, isPresented },
      actions: {
        expand,
        collapse,
        resizeContent,
        recordDockHeight,
        releaseDock,
        reportEditorGrowth,
      },
      meta: { progress, extraHeight, compactDockHeight, contentInset, keyboardTrackingEnabled },
    }),
    [
      isExpanded,
      isPresented,
      expand,
      collapse,
      resizeContent,
      recordDockHeight,
      releaseDock,
      reportEditorGrowth,
      progress,
      extraHeight,
      compactDockHeight,
      contentInset,
      keyboardTrackingEnabled,
    ],
  );

  return (
    <ComposerExpansionContext value={value}>
      <View
        className="flex-1"
        onLayout={(event) => viewportHeight.set(event.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </ComposerExpansionContext>
  );
}

/** Optional so ordinary chat, image prompts and standalone composers keep their layout. */
export function useComposerExpansion() {
  return use(ComposerExpansionContext);
}

/** Tracks accessory growth without asking the message list to resize during expansion. */
export function ComposerExpansionMeasure({ children }: PropsWithChildren) {
  const expansion = useComposerExpansion();
  const height = useRef(0);
  const handleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight === height.current) return;
    if (expansion?.state.isPresented) expansion.actions.resizeContent(nextHeight - height.current);
    height.current = nextHeight;
  };
  return <View onLayout={handleLayout}>{children}</View>;
}

/** Fade only the opaque background, never the ancestor of native glass controls. */
export function ComposerExpansionBackground() {
  const expansion = useComposerExpansion();
  if (!expansion) return null;
  return <ExpansionBackground progress={expansion.meta.progress} />;
}

function ExpansionBackground({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return (
    <Animated.View
      className="absolute inset-0 rounded-t-4xl bg-popover"
      pointerEvents="none"
      style={style}
    />
  );
}
