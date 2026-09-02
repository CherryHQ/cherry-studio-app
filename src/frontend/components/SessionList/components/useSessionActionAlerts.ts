import { useAlert, useToast } from '@cherrystudio/ui/components';
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
  const { toast } = useToast();

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
            toast.show({ label: t('session.rename.failed'), variant: 'danger' });
          });
        },
        title: t('session.renameTitle'),
      });
    },
    [alert, renameSession, t, toast],
  );

  const requestDelete = useCallback(
    (session: AgentSessionEntity) => {
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('session.deleteMessage'),
        onConfirm: () => {
          void deleteSession(session.id).catch(() => {
            toast.show({ label: t('session.deleteFailed'), variant: 'danger' });
          });
        },
        role: 'destructive',
        title: t('session.deleteTitle'),
      });
    },
    [alert, deleteSession, t, toast],
  );

  return { requestDelete, requestRename };
}
