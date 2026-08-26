import { useMemo } from 'react';

import { type SelectionSource, usePendingDeletionIds } from '@/frontend/components/selection';

import { useSessionListActions, useSessionListSessions } from '../context/SessionListProvider';

export const sessionSelectionScope = 'agent-sessions';

// Selection behavior the shared toolbar uses for the session list. Built from
// SessionListProvider data, so this must be called within that provider.
export function useSessionSelectionSource(): SelectionSource {
  const { sessions } = useSessionListSessions();
  const { deleteSessions } = useSessionListActions();
  const pendingDeletionIds = usePendingDeletionIds(sessionSelectionScope);

  return useMemo(
    () => ({
      copy: {
        deleteFailed: 'session.selection.deleteFailed',
        deleteMessage: 'session.selection.deleteMessage',
        deleteTitle: 'session.selection.deleteTitle',
      },
      deleteSelected: deleteSessions,
      getAllIds: () =>
        sessions
          .filter((session) => !pendingDeletionIds.has(session.id))
          .map((session) => session.id),
    }),
    [deleteSessions, pendingDeletionIds, sessions],
  );
}
