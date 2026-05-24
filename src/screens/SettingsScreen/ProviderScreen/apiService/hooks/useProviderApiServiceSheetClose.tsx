import { useNavigation } from 'expo-router';
import type { NavigationAction } from 'expo-router/react-navigation';
import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

export function useProviderApiServiceSheetClose({
  hasUnsavedChanges,
  isSaving,
  onClose,
  onDiscard,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onClose?: () => void;
  onDiscard: () => void;
}) {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const isConfirmedCloseRef = useRef(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

  const closeWithoutPrompt = useCallback(() => {
    isConfirmedCloseRef.current = true;
    onClose?.();
    navigation.goBack();
  }, [navigation, onClose]);

  const confirmDiscard = useCallback((onConfirm: () => void) => {
    Keyboard.dismiss();
    pendingCloseRef.current = onConfirm;
    setIsDiscardDialogOpen(true);
  }, []);

  const cancelDiscard = useCallback(() => {
    pendingCloseRef.current = null;
    setIsDiscardDialogOpen(false);
  }, []);

  const discardAndClose = useCallback(() => {
    const onConfirm = pendingCloseRef.current;
    pendingCloseRef.current = null;
    setIsDiscardDialogOpen(false);
    onDiscard();
    onConfirm?.();
  }, [onDiscard]);

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

  return {
    closeWithoutPrompt,
    discardDialog: (
      <Dialog isOpen={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={false} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <View className="gap-1.5">
              <Dialog.Title>{t('settings.provider.apiService.discardTitle')}</Dialog.Title>
              <Dialog.Description>
                {t('settings.provider.apiService.discardMessage')}
              </Dialog.Description>
            </View>
            <View className="flex-row justify-end gap-3">
              <Button
                className="min-w-20 rounded-xl"
                size="sm"
                variant="secondary"
                onPress={cancelDiscard}
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                className="min-w-20 rounded-xl"
                size="sm"
                variant="danger"
                onPress={discardAndClose}
              >
                <Text className="text-sm text-white">{t('common.discard')}</Text>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    ),
    requestClose,
  };
}
