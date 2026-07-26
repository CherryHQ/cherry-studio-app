import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { Spinner } from 'heroui-native/spinner';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

export function useConfirmDialog() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
    title: string;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const requestConfirm = useCallback(
    ({
      message,
      onConfirm,
      title,
    }: {
      message: string;
      onConfirm: () => Promise<void> | void;
      title: string;
    }) => {
      Keyboard.dismiss();
      setIsConfirming(false);
      setDialog({ message, onConfirm, title });
    },
    [],
  );

  const closeDialog = useCallback(() => {
    if (isConfirming) {
      return;
    }
    setDialog(null);
  }, [isConfirming]);

  const confirmDialog = useCallback(async () => {
    const onConfirm = dialog?.onConfirm;
    if (!onConfirm || isConfirming) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm();
      setDialog(null);
    } finally {
      setIsConfirming(false);
    }
  }, [dialog, isConfirming]);

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
                isDisabled={isConfirming}
                size="sm"
                variant="secondary"
                onPress={closeDialog}
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                className="min-w-20 rounded-xl"
                isDisabled={isConfirming}
                size="sm"
                variant="danger"
                onPress={() => {
                  void confirmDialog();
                }}
              >
                <View className="min-w-0 flex-row items-center justify-center gap-2">
                  {isConfirming ? <Spinner size="sm" /> : null}
                  <Text className="text-sm text-white">{t('common.remove')}</Text>
                </View>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    ),
    requestConfirm,
  };
}
