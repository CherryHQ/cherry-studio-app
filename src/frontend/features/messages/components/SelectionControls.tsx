import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionSource,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';
import { SelectionToolbar } from '@/frontend/components/messageTabs/SelectionToolbar/SelectionToolbar';

export function SelectionControls() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { scope } = useMessageScope();
  const source = useMessageSelectionSource(scope);
  const { exitEditing, toggleAll } = useMessageSelectionActions();
  const { isEditing, selectedIds } = useMessageSelectionState();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const selectedCount = selectedIds.size;

  const handleToggleAll = useCallback(() => {
    toggleAll(source?.getAllIds() ?? []);
  }, [source, toggleAll]);

  const requestDelete = useCallback(() => {
    if (selectedIds.size > 0) {
      setIsDeleteDialogOpen(true);
    }
  }, [selectedIds.size]);

  const closeDeleteDialog = useCallback(() => {
    if (!isDeleting) {
      setIsDeleteDialogOpen(false);
    }
  }, [isDeleting]);

  const confirmDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || !source) {
      setIsDeleteDialogOpen(false);
      return;
    }

    setIsDeleting(true);
    try {
      await source.deleteSelected(ids);
      setIsDeleteDialogOpen(false);
      exitEditing();
    } catch {
      toast.show({ label: t(source.copy.deleteFailed), variant: 'danger' });
    } finally {
      setIsDeleting(false);
    }
  }, [exitEditing, selectedIds, source, t, toast]);

  return (
    <>
      {isEditing ? (
        <SelectionToolbar
          isDeleting={isDeleting}
          onDelete={requestDelete}
          onToggleAll={handleToggleAll}
          selectedCount={selectedCount}
        />
      ) : null}

      <Dialog isOpen={isDeleteDialogOpen} onOpenChange={(isOpen) => !isOpen && closeDeleteDialog()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={!isDeleting} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <View className="gap-1.5">
              {/* `source` is registered by the active list on mount, so it can be
                  undefined on the first frames / right after a scope switch. Guard the
                  copy lookups so we never call `t('')` (which warns about the missing
                  empty key and its plural forms). The dialog can only be opened once a
                  source exists, so this never blanks a visible dialog. */}
              <Dialog.Title>{source ? t(source.copy.deleteTitle) : null}</Dialog.Title>
              <Dialog.Description>
                {source ? t(source.copy.deleteMessage, { count: selectedCount }) : null}
              </Dialog.Description>
            </View>
            <View className="flex-row justify-end gap-3">
              <Button
                className="min-w-20 rounded-xl"
                isDisabled={isDeleting}
                onPress={closeDeleteDialog}
                size="sm"
                variant="secondary"
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                className="min-w-20 rounded-xl disabled:opacity-100"
                isDisabled={isDeleting}
                onPress={() => void confirmDelete()}
                size="sm"
                variant="danger"
              >
                <View className="min-w-0 flex-row items-center justify-center gap-2">
                  {isDeleting ? <Spinner color="white" size="sm" /> : null}
                  <Text className="text-sm text-white">{t('common.delete')}</Text>
                </View>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}
