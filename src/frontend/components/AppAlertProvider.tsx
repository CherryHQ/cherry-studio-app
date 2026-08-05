import { Alert, type DialogActionRole } from '@cherrystudio/ui/components';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

type MessageAlertOptions = {
  actionLabel?: string;
  description?: string;
  title: string;
};

type ConfirmationAlertOptions = {
  confirmLabel: string;
  description?: string;
  onConfirm: () => Promise<void> | void;
  role?: Exclude<DialogActionRole, 'cancel'>;
  title: string;
};

type QueuedAlert = {
  actions: {
    label: string;
    onPress?: () => void;
    role?: DialogActionRole;
  }[];
  description?: string;
  title: string;
};

type AppAlertContextValue = {
  showConfirmation: (options: ConfirmationAlertOptions) => void;
  showMessage: (options: MessageAlertOptions) => void;
};

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

export function AppAlertProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const shouldAdvanceRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [queue, setQueue] = useState<QueuedAlert[]>([]);
  const activeAlert = queue[0];

  const enqueue = useCallback((alert: QueuedAlert) => {
    setQueue((current) => [...current, alert]);
  }, []);

  const showConfirmation = useCallback(
    ({
      confirmLabel,
      description,
      onConfirm,
      role = 'default',
      title,
    }: ConfirmationAlertOptions) => {
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

  const showMessage = useCallback(
    ({ actionLabel = t('common.ok'), description, title }: MessageAlertOptions) => {
      enqueue({ actions: [{ label: actionLabel }], description, title });
    },
    [enqueue, t],
  );

  const handleOpenChange = useCallback((nextIsOpen: boolean) => {
    if (nextIsOpen) {
      setIsOpen(true);
      return;
    }

    shouldAdvanceRef.current = true;
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    if (shouldAdvanceRef.current) {
      shouldAdvanceRef.current = false;
      setQueue((current) => current.slice(1));
      return;
    }

    if (activeAlert) {
      setIsOpen(true);
    }
  }, [activeAlert, isOpen]);

  const contextValue = useMemo(
    () => ({ showConfirmation, showMessage }),
    [showConfirmation, showMessage],
  );

  return (
    <AppAlertContext value={contextValue}>
      {children}
      <Alert
        actions={activeAlert?.actions ?? []}
        description={activeAlert?.description}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        testID="app-alert"
        title={activeAlert?.title ?? ''}
      />
    </AppAlertContext>
  );
}

export function useAppAlert() {
  const context = use(AppAlertContext);

  if (!context) {
    throw new Error('useAppAlert must be used within AppAlertProvider');
  }

  return context;
}
