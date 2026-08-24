import type { PropsWithChildren } from 'react';

export type ToastVariant = 'danger' | 'default' | 'success' | 'warning';

export type ToastShowOptions = {
  duration?: number;
  label: string;
  variant?: ToastVariant;
};

export type ToastController = {
  show: (options: ToastShowOptions) => void;
};

export type ToastProviderProps = PropsWithChildren;
