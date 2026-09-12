import type { PropsWithChildren } from 'react';

import type { AlertInput, DialogActionRole } from './alert.types';

export type AlertShowOptions = {
  actionLabel?: string;
  description?: string;
  title: string;
};

export type AlertConfirmOptions = {
  confirmLabel: string;
  description?: string;
  onConfirm: () => Promise<void> | void;
  role?: Exclude<DialogActionRole, 'cancel'>;
  title: string;
};

export type AlertPromptOptions = {
  confirmLabel: string;
  description?: string;
  input: Omit<AlertInput, 'onChangeText' | 'value'> & { initialValue: string };
  onConfirm: (value: string) => Promise<void> | void;
  title: string;
};

export type AlertController = {
  confirm: (options: AlertConfirmOptions) => void;
  prompt: (options: AlertPromptOptions) => void;
  show: (options: AlertShowOptions) => void;
};

export type AlertProviderProps = PropsWithChildren<{
  labels: { cancel: string; ok: string };
}>;
