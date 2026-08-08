import { createContext, type ReactNode, use, useMemo } from 'react';
import {
  type DerivedValue,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  toastEnterMotion,
  toastExitMotion,
  toastFadeMotion,
  toastMorphMotion,
  toastPressMotion,
} from './dynamic-toast.motion';

export const COLLAPSED_WIDTH = 194;
export const EXPANDED_HEIGHT = 75;
export const COLLAPSED_HEIGHT = 40;
export const SPACE = 20;
export const COLLAPSED_SPACE = 8;
export const EXPANDED_SPACE = 12;

export type DynamicToastState = {
  isBackdropPressed: SharedValue<boolean>;
  isExpanded: SharedValue<boolean>;
  isPresented: SharedValue<boolean>;
  isPressed: SharedValue<boolean>;
};

export type DynamicToastActions = {
  collapse: () => void;
  expand: () => void;
  hide: () => void;
  setBackdropPressed: (isPressed: boolean) => void;
  setPressed: (isPressed: boolean) => void;
  show: () => void;
};

export type DynamicToastMeta = {
  expansionProgress: DerivedValue<number>;
  presentationProgress: DerivedValue<number>;
  pressProgress: DerivedValue<number>;
  visibilityProgress: DerivedValue<number>;
};

export type DynamicToastContextValue = {
  actions: DynamicToastActions;
  meta: DynamicToastMeta;
  state: DynamicToastState;
};

export const DynamicToastContext = createContext<DynamicToastContextValue | null>(null);

export function Provider({ children }: { children: ReactNode }) {
  const isExpanded = useSharedValue(false);
  const isPresented = useSharedValue(false);
  const isPressed = useSharedValue(false);
  const isBackdropPressed = useSharedValue(false);
  const expansionProgress = useDerivedValue<number>(() =>
    withTiming(isExpanded.get() ? 1 : 0, toastMorphMotion),
  );
  const presentationProgress = useDerivedValue<number>(() => {
    const isPresentedValue = isPresented.get();
    return withTiming(
      isPresentedValue ? 1 : 0,
      isPresentedValue ? toastEnterMotion : toastExitMotion,
    );
  });
  const pressProgress = useDerivedValue<number>(() =>
    withTiming(isPressed.get() ? 1 : 0, toastPressMotion),
  );
  const visibilityProgress = useDerivedValue<number>(() =>
    withTiming(isPresented.get() ? 1 : 0, toastFadeMotion),
  );
  const contextValue = useMemo<DynamicToastContextValue>(
    () => ({
      actions: {
        collapse: () => isExpanded.set(false),
        expand: () => isExpanded.set(true),
        hide: () => {
          isExpanded.set(false);
          isPresented.set(false);
        },
        setBackdropPressed: (isPressedValue) => isBackdropPressed.set(isPressedValue),
        setPressed: (isPressedValue) => isPressed.set(isPressedValue),
        show: () => isPresented.set(true),
      },
      meta: {
        expansionProgress,
        presentationProgress,
        pressProgress,
        visibilityProgress,
      },
      state: {
        isBackdropPressed,
        isExpanded,
        isPresented,
        isPressed,
      },
    }),
    [
      expansionProgress,
      isBackdropPressed,
      isExpanded,
      isPresented,
      isPressed,
      presentationProgress,
      pressProgress,
      visibilityProgress,
    ],
  );

  return <DynamicToastContext value={contextValue}>{children}</DynamicToastContext>;
}

export function useDynamicToast() {
  const context = use(DynamicToastContext);

  if (!context) {
    throw new Error('useDynamicToast must be used within DynamicToast.Provider');
  }

  return context;
}
