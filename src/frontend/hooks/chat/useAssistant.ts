import { useCallback } from 'react';
import { useMutation, useQuery } from '@/frontend/data';
import type {
  CreateAssistantDto,
  UpdateAssistantDto,
} from '@cherrystudio/universal/data/api/schemas/assistants';
import { type Assistant } from '@cherrystudio/universal/data/types/assistant';

const ASSISTANTS_LIST_LIMIT = 500;
const EMPTY_ASSISTANTS: readonly Assistant[] = Object.freeze([]);

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
  const createMutation = useMutation('POST', '/assistants', {
    refresh: ['/assistants'],
  });
  const updateMutation = useMutation('PATCH', '/assistants/:id', {
    refresh: ({ args }) => ['/assistants', ...(args ? [`/assistants/${args.params.id}`] : [])],
  });
  const deleteMutation = useMutation('DELETE', '/assistants/:id', {
    refresh: ({ args }) => ['/assistants', ...(args ? [`/assistants/${args.params.id}`] : [])],
  });
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

  const deleteAssistant = useCallback(
    (id: string) => deleteAssistantRequest({ params: { id } }),
    [deleteAssistantRequest],
  );

  return {
    createAssistant,
    updateAssistant,
    deleteAssistant,
    isCreating: createMutation.isLoading,
    isUpdating: updateMutation.isLoading,
    isDeleting: deleteMutation.isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
