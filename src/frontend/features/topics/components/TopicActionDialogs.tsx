import { Input, TextField } from '@cherrystudio/ui/components';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { Spinner } from 'heroui-native/spinner';
import { type ReactNode, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';

import { useTopicListActions } from '../context/TopicListProvider';

type TopicActionDialogs = {
  dialogs: ReactNode;
  requestDelete: (topic: Topic) => void;
  requestRename: (topic: Topic) => void;
};

export function useTopicActionDialogs(): TopicActionDialogs {
  const { t } = useTranslation();
  const { deleteTopic, renameTopic } = useTopicListActions();
  const { showConfirmation, showMessage } = useAppAlert();
  const [renameTarget, setRenameTarget] = useState<Topic | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestRename = useCallback((topic: Topic) => {
    setNameDraft(topic.name);
    setRenameTarget(topic);
  }, []);

  const requestDelete = useCallback(
    (topic: Topic) => {
      Keyboard.dismiss();
      showConfirmation({
        confirmLabel: t('common.delete'),
        description: t('topic.deleteMessage'),
        onConfirm: () => {
          void deleteTopic(topic.id).catch(() => {
            showMessage({ title: t('topic.deleteFailed') });
          });
        },
        role: 'destructive',
        title: t('topic.deleteTitle'),
      });
    },
    [deleteTopic, showConfirmation, showMessage, t],
  );

  const closeRename = useCallback(() => {
    if (!isSubmitting) {
      setRenameTarget(null);
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

  const dialogs = (
    <Dialog isOpen={Boolean(renameTarget)} onOpenChange={(isOpen) => !isOpen && closeRename()}>
      <Dialog.Portal unstable_accessibilityContainerViewIsModal>
        <Dialog.Overlay isCloseOnPress={false} />
        <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
          <Dialog.Title>{t('topic.renameTitle')}</Dialog.Title>
          <TextField isDisabled={isSubmitting}>
            <Input
              accessibilityLabel={t('topic.renameTitle')}
              autoFocus
              onChangeText={setNameDraft}
              onSubmitEditing={confirmRename}
              placeholder={t('topic.renamePlaceholder')}
              returnKeyType="done"
              selectTextOnFocus
              value={nameDraft}
            />
          </TextField>
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
  );

  return { dialogs, requestDelete, requestRename };
}
