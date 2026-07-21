import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { Spinner } from 'heroui-native/spinner';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useTopicListActions } from '../context/TopicListProvider';
import {
  useTopicListSelectionActions,
  useTopicListSelectionState,
} from '../context/TopicListSelectionProvider';
import { TopicSelectionToolbar } from './TopicSelectionToolbar';

export function TopicSelectionControls() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { deleteTopics } = useTopicListActions();
  const { exitEditing, toggleAllTopics } = useTopicListSelectionActions();
  const { isEditing, selectedTopicIds } = useTopicListSelectionState();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const selectedCount = selectedTopicIds.size;

  const requestDelete = useCallback(() => {
    if (selectedTopicIds.size > 0) {
      setIsDeleteDialogOpen(true);
    }
  }, [selectedTopicIds.size]);

  const closeDeleteDialog = useCallback(() => {
    if (!isDeleting) {
      setIsDeleteDialogOpen(false);
    }
  }, [isDeleting]);

  const confirmDelete = useCallback(async () => {
    const topicIds = [...selectedTopicIds];
    if (topicIds.length === 0) {
      setIsDeleteDialogOpen(false);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteTopics(topicIds);
      setIsDeleteDialogOpen(false);
      exitEditing();
    } catch {
      toast.show({ label: t('topic.selection.deleteFailed'), variant: 'danger' });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTopics, exitEditing, selectedTopicIds, t, toast]);

  return (
    <>
      {isEditing ? (
        <TopicSelectionToolbar
          isDeleting={isDeleting}
          onDelete={requestDelete}
          onToggleAll={toggleAllTopics}
          selectedCount={selectedCount}
        />
      ) : null}

      <Dialog isOpen={isDeleteDialogOpen} onOpenChange={(isOpen) => !isOpen && closeDeleteDialog()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={!isDeleting} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <View className="gap-1.5">
              <Dialog.Title>{t('topic.selection.deleteTitle')}</Dialog.Title>
              <Dialog.Description>
                {t('topic.selection.deleteMessage', { count: selectedCount })}
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
                className="min-w-20 rounded-xl"
                isDisabled={isDeleting}
                onPress={() => void confirmDelete()}
                size="sm"
                variant="danger"
              >
                <View className="min-w-0 flex-row items-center justify-center gap-2">
                  {isDeleting ? <Spinner size="sm" /> : null}
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
