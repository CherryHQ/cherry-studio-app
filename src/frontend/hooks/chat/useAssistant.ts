import type {
  CreateAssistantDto,
  DeleteAssistantResult,
  UpdateAssistantDto,
} from '@cherrystudio/universal/data/api/schemas/assistants';
import type { OffsetPaginationResponse } from '@cherrystudio/universal/data/api/types';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useMutation, useQuery } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromCountedList,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';

const ASSISTANTS_LIST_LIMIT = 500;
const EMPTY_ASSISTANTS: readonly Assistant[] = Object.freeze([]);
type AssistantListData = OffsetPaginationResponse<Assistant>;
type AssistantDeleteRequest = { deleteTopics: boolean; id: string };

export function useAssistantsApi() {
  const query = useQuery('/assistants', {
    query: { limit: ASSISTANTS_LIST_LIMIT },
  });

  return {
    assistants: query.data?.items ?? EMPTY_ASSISTANTS,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useAssistantApiById(id: string | undefined) {
  const enabled = Boolean(id);
  const query = useQuery('/assistants/:id', {
    enabled,
    params: { id: id ?? '' },
  });

  return {
    assistant: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useAssistantMutations() {
  const queryClient = useQueryClient();
  const createMutation = useMutation('POST', '/assistants', {
    refresh: ['/assistants'],
  });
  const updateMutation = useMutation('PATCH', '/assistants/:id', {
    refresh: ({ args }) => ['/assistants', ...(args ? [`/assistants/${args.params.id}`] : [])],
  });
  const deleteMutation = useMutation('DELETE', '/assistants/:id');
  const createAssistantRequest = createMutation.trigger;
  const updateAssistantRequest = updateMutation.trigger;
  const deleteAssistantRequest = deleteMutation.trigger;

  const createAssistant = useCallback(
    (dto: CreateAssistantDto) => createAssistantRequest({ body: dto }),
    [createAssistantRequest],
  );

  const updateAssistant = useCallback(
    (id: string, patch: UpdateAssistantDto) => {
      if (!id) {
        throw new Error('updateAssistant called with empty id');
      }
      return updateAssistantRequest({ body: patch, params: { id } });
    },
    [updateAssistantRequest],
  );

  const deleteAssistantBatch = useCallback(
    async (requests: readonly AssistantDeleteRequest[]) => {
      const ids = new Set(requests.map((request) => request.id));
      const snapshot = await updateQueriesOptimistically<AssistantListData>(
        queryClient,
        dataApiCollectionFilters('/assistants'),
        (current) => removeItemsFromCountedList(current, ids),
      );
      const results = await Promise.allSettled(
        requests.map(({ deleteTopics, id }) =>
          deleteAssistantRequest(
            deleteTopics ? { params: { id }, query: { deleteTopics: true } } : { params: { id } },
          ),
        ),
      );
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          queryClient.removeQueries({ queryKey: [`/assistants/${requests[index].id}`] });
        }
      }

      if (firstFailure) {
        restoreQuerySnapshot(queryClient, snapshot);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/assistants'] }),
        queryClient.invalidateQueries({ queryKey: ['/pins'] }),
        ...(requests.some((request) => request.deleteTopics)
          ? [queryClient.invalidateQueries({ queryKey: ['/topics'] })]
          : []),
      ]);

      if (firstFailure) {
        throw firstFailure.reason;
      }

      return results.map(
        (result) => (result as PromiseFulfilledResult<DeleteAssistantResult>).value,
      );
    },
    [deleteAssistantRequest, queryClient],
  );

  const deleteAssistant = useCallback(
    async (
      id: string,
      options: { deleteTopics?: boolean } = {},
    ): Promise<DeleteAssistantResult> => {
      const [result] = await deleteAssistantBatch([
        { deleteTopics: options.deleteTopics === true, id },
      ]);
      return result;
    },
    [deleteAssistantBatch],
  );

  const deleteAssistants = useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      await deleteAssistantBatch(uniqueIds.map((id) => ({ deleteTopics: false, id })));
    },
    [deleteAssistantBatch],
  );

  return {
    createAssistant,
    updateAssistant,
    deleteAssistant,
    deleteAssistants,
    isCreating: createMutation.isLoading,
    isUpdating: updateMutation.isLoading,
    isDeleting: deleteMutation.isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
