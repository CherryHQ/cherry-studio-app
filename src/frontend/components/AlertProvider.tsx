import {
  Alert,
  type AlertInput,
  type DialogAction,
  type DialogActionRole,
} from '@cherrystudio/ui/components';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

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

type QueuedAlert = {
  actions: (Omit<DialogAction, 'onPress'> & {
    onPress?: (inputValue?: string) => void;
  })[];
  description?: string;
  id: number;
  input?: Omit<AlertInput, 'onChangeText'>;
  title: string;
};

export type AlertController = {
  confirm: (options: AlertConfirmOptions) => void;
  prompt: (options: AlertPromptOptions) => void;
  show: (options: AlertShowOptions) => void;
};

type AlertContextValue = {
  alert: AlertController;
};

const AlertContext = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
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
          { label: t('common.cancel'), role: 'cancel' },
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
    [enqueue, t],
  );

  const show = useCallback(
    ({ actionLabel = t('common.ok'), description, title }: AlertShowOptions) => {
      enqueue({ actions: [{ label: actionLabel }], description, title });
    },
    [enqueue, t],
  );

  const prompt = useCallback(
    ({ confirmLabel, description, input, onConfirm, title }: AlertPromptOptions) => {
      Keyboard.dismiss();
      enqueue({
        actions: [
          { label: t('common.cancel'), role: 'cancel' },
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
    [enqueue, t],
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

  const handleOpenChange = useCallback((nextIsOpen: boolean) => {
    if (!nextIsOpen) {
      setQueue((current) => current.slice(1));
    }
  }, []);

  const alert = useMemo<AlertController>(
    () => ({ confirm, prompt, show }),
    [confirm, prompt, show],
  );
  const contextValue = useMemo(() => ({ alert }), [alert]);

  const actions =
    activeAlert?.actions.map(({ onPress, ...action }) => ({
      ...action,
      onPress: onPress ? () => onPress(activeAlert.input?.value) : undefined,
    })) ?? [];
  const input = activeAlert?.input
    ? { ...activeAlert.input, onChangeText: handleInputChange }
    : undefined;

  return (
    <AlertContext value={contextValue}>
      {children}
      <Alert
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

export function useAlert() {
  const context = use(AlertContext);

  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }

  return context;
}
