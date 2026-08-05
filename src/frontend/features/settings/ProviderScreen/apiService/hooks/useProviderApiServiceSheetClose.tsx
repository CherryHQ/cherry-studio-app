import { Alert } from '@cherrystudio/ui/components';
import { useNavigation } from 'expo-router';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

/**
 * Confirms before leaving an edit screen that still holds uncommitted input. Discarding
 * needs no reset step: the draft lives in the form's own state and dies with it.
 */
export function useProviderApiServiceSheetClose({
  hasUnsavedChanges,
  isSaving,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}) {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const isConfirmedCloseRef = useRef(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);
  const [isDiscardAlertOpen, setIsDiscardAlertOpen] = useState(false);

  const closeWithoutPrompt = useCallback(() => {
    isConfirmedCloseRef.current = true;
    navigation.goBack();
  }, [navigation]);

  const confirmDiscard = useCallback((onConfirm: () => void) => {
    Keyboard.dismiss();
    pendingCloseRef.current = onConfirm;
    setIsDiscardAlertOpen(true);
  }, []);

  const cancelDiscard = useCallback(() => {
    pendingCloseRef.current = null;
    setIsDiscardAlertOpen(false);
  }, []);

  const discardAndClose = useCallback(() => {
    const onConfirm = pendingCloseRef.current;
    pendingCloseRef.current = null;
    setIsDiscardAlertOpen(false);
    onConfirm?.();
  }, []);

  const requestClose = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (!hasUnsavedChanges) {
      closeWithoutPrompt();
      return;
    }

    // react-doctor-disable-next-line no-impure-state-updater -- confirmDiscard 存放的是事件延续回调，不是 state updater
    confirmDiscard(closeWithoutPrompt);
  }, [closeWithoutPrompt, confirmDiscard, hasUnsavedChanges, isSaving]);

  // react-doctor-disable-next-line effect-needs-cleanup -- addListener 的返回值就在下方 return unsubscribe 中清理
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (isConfirmedCloseRef.current) {
        return;
      }

      if (isSaving) {
        event.preventDefault();
        return;
      }

      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      // react-doctor-disable-next-line no-impure-state-updater -- confirmDiscard 存放的是事件延续回调，不是 state updater
      confirmDiscard(() => {
        isConfirmedCloseRef.current = true;
        navigation.dispatch(event.data.action as NavigationAction);
      });
    });

    return unsubscribe;
  }, [confirmDiscard, hasUnsavedChanges, isSaving, navigation]);

  return {
    closeWithoutPrompt,
    discardDialog: (
      <Alert
        actions={[
          { label: t('common.cancel'), onPress: cancelDiscard, role: 'cancel' },
          { label: t('common.discard'), onPress: discardAndClose, role: 'destructive' },
        ]}
        description={t('settings.provider.apiService.discardMessage')}
        isOpen={isDiscardAlertOpen}
        onOpenChange={setIsDiscardAlertOpen}
        title={t('settings.provider.apiService.discardTitle')}
      />
    ),
    requestClose,
  };
}
