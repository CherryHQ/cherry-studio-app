import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { Topic } from '@/shared/data/types/topic';

import { useTopicListActions } from '../context/TopicListProvider';

type TopicActionAlerts = {
  requestDelete: (topic: Topic) => void;
  requestRename: (topic: Topic) => void;
};

export function useTopicActionAlerts(): TopicActionAlerts {
  const { t } = useTranslation();
  const { deleteTopic, renameTopic } = useTopicListActions();
  const { alert } = useAlert();
  const { toast } = useToast();

  const requestRename = useCallback(
    (topic: Topic) => {
      alert.prompt({
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
            toast.show({ label: t('topic.rename.failed'), variant: 'danger' });
          });
        },
        title: t('topic.renameTitle'),
      });
    },
    [alert, renameTopic, t, toast],
  );

  const requestDelete = useCallback(
    (topic: Topic) => {
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('topic.deleteMessage'),
        onConfirm: () => {
          void deleteTopic(topic.id).catch(() => {
            alert.show({ title: t('topic.deleteFailed') });
          });
        },
        role: 'destructive',
        title: t('topic.deleteTitle'),
      });
    },
    [alert, deleteTopic, t],
  );

  return { requestDelete, requestRename };
}
