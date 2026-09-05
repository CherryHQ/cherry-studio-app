import { ToastProvider as HeroToastProvider, useToast as useHeroToast } from 'heroui-native/toast';
import { createContext, use, useEffect, useMemo, useRef } from 'react';

import type { ToastController, ToastProviderProps } from './toast.types';

const DEFAULT_TOAST_DURATION = 4000;

const ToastContext = createContext<ToastController | null>(null);

function ToastControllerProvider({ children }: ToastProviderProps) {
  const { toast: heroToast } = useHeroToast();
  const heroToastRef = useRef(heroToast);

  useEffect(() => {
    heroToastRef.current = heroToast;
  }, [heroToast]);

  const controller = useMemo<ToastController>(
    () => ({
      show: ({ duration = DEFAULT_TOAST_DURATION, label, variant }) => {
        void heroToastRef.current.show({ duration, label, variant });
      },
    }),
    [],
  );

  return <ToastContext value={controller}>{children}</ToastContext>;
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <HeroToastProvider>
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
