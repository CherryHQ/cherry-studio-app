import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useWindowDimensions, View } from 'react-native';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

type FullScreenLayers = Readonly<{
  isPresented: boolean;
  /** Returns the release; the screen stays covered until every layer released. */
  present: () => () => void;
  /** How far the shown layer has grown over the screen, from 0 to 1. */
  progress: SharedValue<number>;
}>;

const FullScreenLayerContext = createContext<FullScreenLayers | null>(null);

/**
 * The chat screen's record of content covering all of it, such as an answer opened to read in
 * full. While one is shown the screen hides its header and draws its host above the composer.
 */
export function FullScreenLayerProvider({ children }: PropsWithChildren) {
  const [count, setCount] = useState(0);
  const progress = useSharedValue(0);
  const present = useCallback(() => {
    setCount((current) => current + 1);
    return () => setCount((current) => current - 1);
  }, []);
  const value = useMemo(
    () => ({ isPresented: count > 0, present, progress }),
    [count, present, progress],
  );
  return <FullScreenLayerContext value={value}>{children}</FullScreenLayerContext>;
}

export function useIsFullScreenLayerPresented() {
  return use(FullScreenLayerContext)?.isPresented ?? false;
}

/** The screen's layer progress, which its own chrome follows; absent outside a chat screen. */
export function useFullScreenLayerProgress() {
  return use(FullScreenLayerContext)?.progress;
}

/** Covers the screen while `active`; outside a chat screen there is nothing to cover. */
export function useFullScreenLayer(active: boolean) {
  const present = use(FullScreenLayerContext)?.present;
  useLayoutEffect(() => {
    if (active && present) return present();
  }, [active, present]);
}

/**
 * The region a layer covers from. While a layer is shown it reaches over the composer below it to
 * the screen's end and draws above it; the composer keeps its place underneath.
 */
export function FullScreenLayerHost({ children }: PropsWithChildren) {
  const isPresented = useIsFullScreenLayerPresented();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [restingBottom, setRestingBottom] = useState<number>();
  const measure = () => {
    if (!isPresented)
      ref.current?.measureInWindow((_x, y, _width, height) => setRestingBottom(y + height));
  };
  return (
    <View
      // Screen readers stay inside the layer, as they would in the composer it covers.
      accessibilityViewIsModal={isPresented}
      className="flex-1"
      collapsable={false}
      onLayout={measure}
      ref={ref}
      style={
        isPresented && restingBottom !== undefined
          ? { marginBottom: restingBottom - windowHeight, zIndex: 20 }
          : undefined
      }
    >
      {children}
    </View>
  );
}
