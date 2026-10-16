import { useCallback } from 'react';

import { useCache, useMutation, useQuery } from '@/frontend/data';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

const emptyFolders: FileFolder[] = [];

export type FileWorkspaceAddress = { sessionId?: string; workspaceDraftId?: string };

export function useFileWorkspace(address: FileWorkspaceAddress) {
  const [draftFolderId, setDraftFolderId] = useCache(
    `chat.draft_workspace.${address.workspaceDraftId ?? 'none'}`,
  );
  const folders = useQuery('/files/folders');
  const binding = useQuery('/files/workspace', {
    enabled: Boolean(address.sessionId),
    query: { sessionId: address.sessionId ?? '' },
  });
  const change = useMutation('PATCH', '/files/workspace/:id', {
    refresh: ['/files/workspace'],
  });
  const changeWorkspace = change.trigger;
  const folderId = address.sessionId ? (binding.data?.id ?? null) : draftFolderId;
  const workspace = address.sessionId
    ? binding.data
    : folders.data?.find((folder) => folder.id === folderId);

  const select = useCallback(
    async (id: string | null) => {
      if (address.sessionId) {
        await changeWorkspace({ params: { id: address.sessionId }, body: { folderId: id } });
      } else if (address.workspaceDraftId) {
        setDraftFolderId(id);
      } else {
        throw new Error('A conversation or draft identity is required to associate a workspace.');
      }
    },
    [address.sessionId, address.workspaceDraftId, changeWorkspace, setDraftFolderId],
  );

  return {
    address,
    folderId,
    folders,
    availableFolders: folders.data ?? emptyFolders,
    workspace,
    isLoading: folders.isLoading || (Boolean(address.sessionId) && binding.isLoading),
    isSaving: change.isLoading,
    error: binding.error ?? folders.error,
    refetch: () =>
      Promise.all([...(address.sessionId ? [binding.refetch()] : []), folders.refetch()]),
    select,
  };
}
