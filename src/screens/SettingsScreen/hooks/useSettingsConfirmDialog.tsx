import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

export function useSettingsConfirmDialog() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<{
    message: string;
    onConfirm: () => void;
    title: string;
  } | null>(null);

  const requestConfirm = useCallback(
    ({ message, onConfirm, title }: { message: string; onConfirm: () => void; title: string }) => {
      Keyboard.dismiss();
      setDialog({ message, onConfirm, title });
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const confirmDialog = useCallback(() => {
    const onConfirm = dialog?.onConfirm;
    setDialog(null);
    onConfirm?.();
  }, [dialog]);

  return {
    confirmDialog: (
      <Dialog isOpen={Boolean(dialog)} onOpenChange={(isOpen) => !isOpen && closeDialog()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={false} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <View className="gap-1.5">
              <Dialog.Title>{dialog?.title ?? ''}</Dialog.Title>
              <Dialog.Description>{dialog?.message ?? ''}</Dialog.Description>
            </View>
            <View className="flex-row justify-end gap-3">
              <Button
                className="min-w-20 rounded-xl"
                size="sm"
                variant="secondary"
                onPress={closeDialog}
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                className="min-w-20 rounded-xl"
                size="sm"
                variant="danger"
                onPress={confirmDialog}
              >
                <Text className="text-sm text-white">{t('common.remove')}</Text>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    ),
    requestConfirm,
  };
}
