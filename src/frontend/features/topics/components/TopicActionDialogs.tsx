import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { Input } from 'heroui-native/input';
import { Spinner } from 'heroui-native/spinner';
import { type ReactNode, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import type { Topic } from '@cherrystudio/universal/data/types/topic';

import { useTopicListActions } from '../context/TopicListProvider';

type TopicActionDialogs = {
  dialogs: ReactNode;
  requestDelete: (topic: Topic) => void;
  requestRename: (topic: Topic) => void;
};

export function useTopicActionDialogs(): TopicActionDialogs {
  const { t } = useTranslation();
  const { deleteTopic, renameTopic } = useTopicListActions();
  const [renameTarget, setRenameTarget] = useState<Topic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestRename = useCallback((topic: Topic) => {
    setNameDraft(topic.name);
    setRenameTarget(topic);
  }, []);

  const requestDelete = useCallback((topic: Topic) => {
    Keyboard.dismiss();
    setDeleteTarget(topic);
  }, []);

  const closeRename = useCallback(() => {
    if (!isSubmitting) {
      setRenameTarget(null);
    }
  }, [isSubmitting]);

  const closeDelete = useCallback(() => {
    if (!isSubmitting) {
      setDeleteTarget(null);
    }
  }, [isSubmitting]);

  const confirmRename = useCallback(async () => {
    const target = renameTarget;
    const trimmedName = nameDraft.trim();

    if (!target || !trimmedName || trimmedName === target.name) {
      setRenameTarget(null);
      return;
    }

    setIsSubmitting(true);
    await renameTopic(target.id, trimmedName)
      .then(() => setRenameTarget(null))
      .finally(() => setIsSubmitting(false));
  }, [nameDraft, renameTarget, renameTopic]);

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;

    if (!target) {
      return;
    }

    setIsSubmitting(true);
    await deleteTopic(target.id)
      .then(() => setDeleteTarget(null))
      .finally(() => setIsSubmitting(false));
  }, [deleteTarget, deleteTopic]);

  const dialogs = (
    <>
      <Dialog isOpen={Boolean(renameTarget)} onOpenChange={(isOpen) => !isOpen && closeRename()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={false} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <Dialog.Title>{t('topic.renameTitle')}</Dialog.Title>
            <Input
              accessibilityLabel={t('topic.renameTitle')}
              autoFocus
              className="min-h-10 rounded-xl px-3 py-0 text-base leading-5"
              isDisabled={isSubmitting}
              onChangeText={setNameDraft}
              onSubmitEditing={confirmRename}
              placeholder={t('topic.renamePlaceholder')}
              returnKeyType="done"
              selectTextOnFocus
              style={styles.input}
              value={nameDraft}
              variant="secondary"
            />
            <View className="flex-row justify-end gap-3">
              <Button
                className="min-w-20 rounded-xl"
                isDisabled={isSubmitting}
                onPress={closeRename}
                size="sm"
                variant="secondary"
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                className="min-w-20 rounded-xl"
                isDisabled={isSubmitting || !nameDraft.trim()}
                onPress={confirmRename}
                size="sm"
                variant="primary"
              >
                <View className="min-w-0 flex-row items-center justify-center gap-2">
                  {isSubmitting ? <Spinner size="sm" /> : null}
                  <Text className="text-sm text-white">{t('common.save')}</Text>
                </View>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <Dialog isOpen={Boolean(deleteTarget)} onOpenChange={(isOpen) => !isOpen && closeDelete()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={false} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <View className="gap-1.5">
              <Dialog.Title>{t('topic.deleteTitle')}</Dialog.Title>
              <Dialog.Description>{t('topic.deleteMessage')}</Dialog.Description>
            </View>
            <View className="flex-row justify-end gap-3">
              <Button
                className="min-w-20 rounded-xl"
                isDisabled={isSubmitting}
                onPress={closeDelete}
                size="sm"
                variant="secondary"
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                className="min-w-20 rounded-xl"
                isDisabled={isSubmitting}
                onPress={confirmDelete}
                size="sm"
                variant="danger"
              >
                <View className="min-w-0 flex-row items-center justify-center gap-2">
                  {isSubmitting ? <Spinner size="sm" /> : null}
                  <Text className="text-sm text-white">{t('common.delete')}</Text>
                </View>
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );

  return { dialogs, requestDelete, requestRename };
}

const styles = StyleSheet.create({
  input: {
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    verticalAlign: 'middle',
  },
});
