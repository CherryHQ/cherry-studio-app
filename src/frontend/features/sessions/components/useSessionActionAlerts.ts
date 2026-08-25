import { useAlert } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';

import { useSessionListActions } from '../context/SessionListProvider';

type SessionActionAlerts = {
  requestDelete: (session: AgentSessionEntity) => void;
  requestRename: (session: AgentSessionEntity) => void;
};

export function useSessionActionAlerts(): SessionActionAlerts {
  const { t } = useTranslation();
  const { deleteSession, renameSession } = useSessionListActions();
  const { alert } = useAlert();

  const requestRename = useCallback(
    (session: AgentSessionEntity) => {
      alert.prompt({
        confirmLabel: t('common.save'),
        input: {
          accessibilityLabel: t('session.renameTitle'),
          autoFocus: true,
          initialValue: session.title,
          maxLength: 255,
          placeholder: t('session.rename.placeholder'),
        },
        onConfirm: (title) => {
          const trimmedTitle = title.trim();
          if (!trimmedTitle || trimmedTitle === session.title) {
            return;
          }

          void renameSession(session.id, trimmedTitle).catch(() => {
            alert.show({ title: t('session.rename.failed') });
          });
        },
        title: t('session.renameTitle'),
      });
    },
    [alert, renameSession, t],
  );

  const requestDelete = useCallback(
    (session: AgentSessionEntity) => {
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('session.deleteMessage'),
        onConfirm: () => {
          void deleteSession(session.id).catch(() => {
            alert.show({ title: t('session.deleteFailed') });
          });
        },
        role: 'destructive',
        title: t('session.deleteTitle'),
      });
    },
    [alert, deleteSession, t],
  );

  return { requestDelete, requestRename };
}
