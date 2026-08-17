import { useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import type {
  AlertConfirmOptions,
  AlertController,
  AlertPromptOptions,
  AlertProviderProps,
  AlertShowOptions,
} from '../alert-controller.types';
import type { AlertInput, DialogAction } from '../alert.types';
import { AlertContext } from '../hooks/use-alert';
import { Alert as AlertPrimitive } from './alert/alert';

type QueuedAlert = {
  actions: (Omit<DialogAction, 'onPress'> & {
    onPress?: (inputValue?: string) => void;
  })[];
  description?: string;
  id: number;
  input?: Omit<AlertInput, 'onChangeText'>;
  title: string;
};

export function AlertProvider({ children, labels }: AlertProviderProps) {
  const nextAlertIdRef = useRef(0);
  const [queue, setQueue] = useState<QueuedAlert[]>([]);
  const activeAlert = queue[0];

  const enqueue = useCallback((nextAlert: Omit<QueuedAlert, 'id'>) => {
    const id = nextAlertIdRef.current;
    nextAlertIdRef.current += 1;
    setQueue((current) => [...current, { ...nextAlert, id }]);
  }, []);

  const confirm = useCallback(
    ({ confirmLabel, description, onConfirm, role = 'default', title }: AlertConfirmOptions) => {
      Keyboard.dismiss();
      enqueue({
        actions: [
          { label: labels.cancel, role: 'cancel' },
          {
            label: confirmLabel,
            onPress: () => {
              void onConfirm();
            },
            role,
          },
        ],
        description,
        title,
      });
    },
    [enqueue, labels.cancel],
  );

  const show = useCallback(
    ({ actionLabel = labels.ok, description, title }: AlertShowOptions) => {
      enqueue({ actions: [{ label: actionLabel }], description, title });
    },
    [enqueue, labels.ok],
  );

  const prompt = useCallback(
    ({ confirmLabel, description, input, onConfirm, title }: AlertPromptOptions) => {
      Keyboard.dismiss();
      enqueue({
        actions: [
          { label: labels.cancel, role: 'cancel' },
          {
            label: confirmLabel,
            onPress: (inputValue) => {
              void onConfirm(inputValue ?? input.initialValue);
            },
            role: 'default',
          },
        ],
        description,
        input: {
          accessibilityLabel: input.accessibilityLabel,
          autoFocus: input.autoFocus,
          maxLength: input.maxLength,
          placeholder: input.placeholder,
          value: input.initialValue,
        },
        title,
      });
    },
    [enqueue, labels.cancel],
  );

  const handleInputChange = useCallback((value: string) => {
    setQueue((current) => {
      const active = current[0];
      if (!active?.input || active.input.value === value) {
        return current;
      }

      return [{ ...active, input: { ...active.input, value } }, ...current.slice(1)];
    });
  }, []);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setQueue((current) => current.slice(1));
    }
  }, []);

  const controller = useMemo<AlertController>(
    () => ({ confirm, prompt, show }),
    [confirm, prompt, show],
  );
  const actions =
    activeAlert?.actions.map(({ onPress, ...action }) => ({
      ...action,
      onPress: onPress ? () => onPress(activeAlert.input?.value) : undefined,
    })) ?? [];
  const input = activeAlert?.input
    ? { ...activeAlert.input, onChangeText: handleInputChange }
    : undefined;

  return (
    <AlertContext value={controller}>
      {children}
      <AlertPrimitive
        key={activeAlert?.id ?? 'empty'}
        actions={actions}
        description={activeAlert?.description}
        input={input}
        isOpen={Boolean(activeAlert)}
        onOpenChange={handleOpenChange}
        testID="alert"
        title={activeAlert?.title ?? ''}
      />
    </AlertContext>
  );
}
