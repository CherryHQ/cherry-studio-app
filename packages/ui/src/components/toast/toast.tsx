import {
  Toast as HeroToast,
  type ToastComponentProps,
  ToastProvider as HeroToastProvider,
  useToast as useHeroToast,
} from 'heroui-native/toast';
import { createContext, type ReactNode, use, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import type { ToastController, ToastProviderProps, ToastShowOptions } from './toast.types';

const DEFAULT_TOAST_DURATION = 4000;

const ToastContext = createContext<ToastController | null>(null);

function createToastComponent({ label, variant }: ToastShowOptions) {
  return function ToastContent(props: ToastComponentProps) {
    return (
      <HeroToast {...props} className="max-w-full self-center py-2" variant={variant}>
        <HeroToast.Title className="text-center">{label}</HeroToast.Title>
      </HeroToast>
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
      show: ({ duration = DEFAULT_TOAST_DURATION, label, variant }) => {
        void heroToastRef.current.show({
          duration,
          component: createToastComponent({ label, variant }),
        });
      },
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
