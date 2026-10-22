import type { PropsWithChildren, ReactNode } from 'react';

export type ToastVariant = 'danger' | 'default' | 'success' | 'warning';

export type ToastShowOptions = {
  /** Persistent notices are hidden by the workflow that owns them. */
  duration?: number | 'persistent';
  placement?: 'top' | 'bottom';
  /** Extra space above a screen-owned dock. Bottom toasts also follow the keyboard. */
  bottomOffset?: number;
  actions?: readonly { label: string; onPress: () => void }[];
  dismissLabel?: string;
  /** A subscribing text component can update a persistent notice without remounting the toast. */
  label: ReactNode;
  variant?: ToastVariant;
};

export type ToastController = {
  show: (options: ToastShowOptions) => string;
  hide: (id: string) => void;
};

export type ToastProviderProps = PropsWithChildren;
