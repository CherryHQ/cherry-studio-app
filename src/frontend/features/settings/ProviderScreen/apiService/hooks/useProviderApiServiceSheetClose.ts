import { useNavigation } from 'expo-router';
import type { NavigationAction } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';

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
  const { showConfirmation } = useAppAlert();
  const isConfirmedCloseRef = useRef(false);

  const closeWithoutPrompt = useCallback(() => {
    isConfirmedCloseRef.current = true;
    navigation.goBack();
  }, [navigation]);

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      Keyboard.dismiss();
      showConfirmation({
        confirmLabel: t('common.discard'),
        description: t('settings.provider.apiService.discardMessage'),
        onConfirm,
        role: 'destructive',
        title: t('settings.provider.apiService.discardTitle'),
      });
    },
    [showConfirmation, t],
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

  return { closeWithoutPrompt, requestClose };
}
