import type { PropsWithChildren } from 'react';

export type ToastVariant = 'danger' | 'default' | 'success' | 'warning';

export type ToastShowOptions = {
  duration?: number;
  placement?: 'top' | 'bottom';
  /** Extra space above a screen-owned dock. Bottom toasts also follow the keyboard. */
  bottomOffset?: number;
  actions?: readonly { label: string; onPress: () => void }[];
  dismissLabel?: string;
  label: string;
  variant?: ToastVariant;
};

export type ToastController = {
  show: (options: ToastShowOptions) => string;
  hide: (id: string) => void;
};

export type ToastProviderProps = PropsWithChildren;
