import {
  Toast as HeroToast,
  type ToastComponentProps,
  ToastProvider as HeroToastProvider,
  useToast as useHeroToast,
} from 'heroui-native/toast';
import { createContext, type ReactNode, use, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../button';
import type { ToastController, ToastProviderProps, ToastShowOptions } from './toast.types';

const DEFAULT_TOAST_DURATION = 4000;

const ToastContext = createContext<ToastController | null>(null);

function createToastComponent(options: ToastShowOptions) {
  return function ToastContent(props: ToastComponentProps) {
    const { label, variant, actions, dismissLabel, placement = 'top', bottomOffset = 0 } = options;
    const reducedMotion = useReducedMotion();
    const { bottom } = useSafeAreaInsets();
    const content = (
      <HeroToast
        {...props}
        className={actions ? 'w-full gap-2 py-2' : 'max-w-full self-center py-2'}
        variant={variant}
        placement={placement}
        animation={reducedMotion ? 'disable-all' : undefined}
      >
        <View className="flex-row items-center gap-2">
          <HeroToast.Title className={actions ? 'flex-1' : 'text-center'}>{label}</HeroToast.Title>
          {dismissLabel ? <HeroToast.Close aria-label={dismissLabel} className="size-11" /> : null}
        </View>
        {actions ? (
          <View className="flex-row flex-wrap justify-end gap-2">
            {actions.map((action, index) => (
              <Button
                key={action.label}
                size="sm"
                variant={index === 0 ? 'default' : 'ghost'}
                onPress={() => {
                  props.hide(props.id);
                  action.onPress();
                }}
              >
                {action.label}
              </Button>
            ))}
          </View>
        ) : null}
      </HeroToast>
    );
    return placement === 'bottom' ? (
      <KeyboardStickyView
        pointerEvents="box-none"
        offset={{ opened: bottom }}
        style={[StyleSheet.absoluteFill, { bottom: bottomOffset }]}
      >
        {content}
      </KeyboardStickyView>
    ) : (
      content
    );
  };
}

function ToastControllerProvider({ children }: ToastProviderProps) {
  const { toast: heroToast } = useHeroToast();
  const heroToastRef = useRef(heroToast);

  useEffect(() => {
    heroToastRef.current = heroToast;
  }, [heroToast]);

  const controller = useMemo<ToastController>(
    () => ({
      show: ({ duration = DEFAULT_TOAST_DURATION, ...options }) =>
        heroToastRef.current.show({ duration, component: createToastComponent(options) }),
      hide: (id) => heroToastRef.current.hide(id),
    }),
    [],
  );

  return <ToastContext value={controller}>{children}</ToastContext>;
}

function renderToastViewport(children: ReactNode) {
  return (
    <View className="w-full max-w-sm flex-1 self-center" pointerEvents="box-none">
      {children}
    </View>
  );
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <HeroToastProvider contentWrapper={renderToastViewport}>
      <ToastControllerProvider>{children}</ToastControllerProvider>
    </HeroToastProvider>
  );
}

export function useToast() {
  const toast = use(ToastContext);

  if (!toast) {
    throw new Error('useToast must be used within Toast.Provider');
  }

  return { toast };
}

export const Toast = {
  Provider: ToastProvider,
};
