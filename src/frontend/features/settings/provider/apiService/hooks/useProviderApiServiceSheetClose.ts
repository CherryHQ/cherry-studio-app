import { useAlert } from '@cherrystudio/ui/components';
import { useNavigation } from 'expo-router';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

/** Confirms before leaving an edit screen that still holds uncommitted input. */
export function useProviderApiServiceSheetClose({
  hasUnsavedChanges,
  isSaving,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}) {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const isConfirmedCloseRef = useRef(false);

  const allowNavigation = useCallback(() => {
    isConfirmedCloseRef.current = true;
  }, []);

  const closeWithoutPrompt = useCallback(() => {
    allowNavigation();
    navigation.goBack();
  }, [allowNavigation, navigation]);

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
      confirmDiscard(() => {
        isConfirmedCloseRef.current = true;
        navigation.dispatch(event.data.action as NavigationAction);
      });
    });

    return unsubscribe;
  }, [confirmDiscard, hasUnsavedChanges, isSaving, navigation]);

  return { allowNavigation, closeWithoutPrompt, requestClose };
}
