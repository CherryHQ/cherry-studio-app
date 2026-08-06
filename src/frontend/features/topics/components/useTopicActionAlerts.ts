import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';

import { useTopicListActions } from '../context/TopicListProvider';

type TopicActionAlerts = {
  requestDelete: (topic: Topic) => void;
  requestRename: (topic: Topic) => void;
};

export function useTopicActionAlerts(): TopicActionAlerts {
  const { t } = useTranslation();
  const { deleteTopic, renameTopic } = useTopicListActions();
  const { showConfirmation, showMessage, showPrompt } = useAppAlert();

  const requestRename = useCallback(
    (topic: Topic) => {
      showPrompt({
        confirmLabel: t('common.save'),
        input: {
          accessibilityLabel: t('topic.renameTitle'),
          autoFocus: true,
          initialValue: topic.name,
          maxLength: 255,
          placeholder: t('topic.rename.placeholder'),
        },
        onConfirm: (name) => {
          const trimmedName = name.trim();
          if (!trimmedName || trimmedName === topic.name) {
            return;
          }

          void renameTopic(topic.id, trimmedName).catch(() => {
            showMessage({ title: t('topic.rename.failed') });
          });
        },
        title: t('topic.renameTitle'),
      });
    },
    [renameTopic, showMessage, showPrompt, t],
  );

  const requestDelete = useCallback(
    (topic: Topic) => {
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

  return { requestDelete, requestRename };
}
