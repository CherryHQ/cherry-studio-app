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
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { duration, easing } from '../../../motion';
import { getComposerKeyboardStickyOffset } from '../utils/composer-dock-layout';

type ComposerExpansionContextValue = {
  state: { isExpanded: boolean; isPresented: boolean };
  actions: {
    expand: () => void;
    collapse: () => void;
    resizeContent: (delta: number) => void;
  };
  meta: {
    progress: SharedValue<number>;
    extraHeight: SharedValue<number>;
    compactDockHeight: SharedValue<number>;
    keyboardTrackingEnabled: SharedValue<boolean>;
  };
};

const ComposerExpansionContext = createContext<ComposerExpansionContextValue | null>(null);

/** One screen-local expansion. Children and the native editor never change hosts. */
export function ComposerExpansion({ children }: PropsWithChildren) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPresented, setIsPresented] = useState(false);
  const expandedTarget = useRef(false);
  const viewportHeight = useSharedValue(0);
  const compactDockHeight = useSharedValue(0);
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
      actions: { expand, collapse, resizeContent },
      meta: { progress, extraHeight, compactDockHeight, keyboardTrackingEnabled },
    }),
    [
      isExpanded,
      isPresented,
      expand,
      collapse,
      resizeContent,
      progress,
      extraHeight,
      compactDockHeight,
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
      className="absolute inset-0 rounded-4xl border border-border bg-popover"
      pointerEvents="none"
      style={style}
    />
  );
}
