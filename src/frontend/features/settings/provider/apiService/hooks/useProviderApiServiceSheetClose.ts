import { useAlert } from '@cherrystudio/ui/components';
import { useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

/** Confirms before leaving an edit screen that still holds uncommitted input. */
export function useProviderApiServiceSheetClose({
  hasUnsavedChanges,
  isSaving,
  onClose,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onClose?: () => void;
}) {
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const { alert } = useAlert();
  // Once leaving is confirmed, later input or saving state must not block it again.
  const [isCloseConfirmed, setIsCloseConfirmed] = useState(false);
  const preventRemove = !isCloseConfirmed && (isSaving || hasUnsavedChanges);

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      Keyboard.dismiss();
      alert.confirm({
        confirmLabel: t('common.discard'),
        description: t('settings.provider.apiService.discardMessage'),
        onConfirm,
        role: 'destructive',
        title: t('settings.provider.apiService.discardTitle'),
      });
    },
    [alert, t],
  );

  const disablePrevention = usePreventRemove(preventRemove, ({ repeat }) => {
    if (isSaving) return;
    confirmDiscard(() => {
      setIsCloseConfirmed(true);
      repeat();
    });
  });

  const allowNavigation = useCallback(() => {
    setIsCloseConfirmed(true);
    disablePrevention();
  }, [disablePrevention]);

  const closeWithoutPrompt = useCallback(() => {
    allowNavigation();
    if (onClose) {
      onClose();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace('/');
  }, [allowNavigation, navigation, onClose, router]);

  const requestClose = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (!hasUnsavedChanges) {
      closeWithoutPrompt();
      return;
    }

    confirmDiscard(closeWithoutPrompt);
  }, [closeWithoutPrompt, confirmDiscard, hasUnsavedChanges, isSaving]);

  return { allowNavigation, closeWithoutPrompt, requestClose };
}
