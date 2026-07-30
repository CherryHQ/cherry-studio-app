import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { CreateAssistantDto, UpdateAssistantDto } from '@/shared/data/api/schemas/assistants';
import { type Assistant } from '@/shared/data/types/assistant';

const ASSISTANTS_LIST_LIMIT = 500;
const EMPTY_ASSISTANTS: readonly Assistant[] = Object.freeze([]);

export function useAssistantsApi() {
  const assistants = useBackendModule('assistants');
  const query = useQuery({
    queryFn: () => assistants.list({ limit: ASSISTANTS_LIST_LIMIT }),
    queryKey: queryKeys.assistants.list({ limit: ASSISTANTS_LIST_LIMIT }),
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
  const assistants = useBackendModule('assistants');
  const enabled = Boolean(id);
  const queryAssistantId = id ?? '__missing_assistant__';
  const query = useQuery({
    enabled,
    queryFn: () => assistants.get(id ?? ''),
    queryKey: queryKeys.assistants.detail(queryAssistantId),
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
  const assistants = useBackendModule('assistants');
  const queryClient = useQueryClient();

  const invalidateAssistants = useCallback(
    async (assistantId?: string) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assistants.all() });

      if (assistantId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.assistants.detail(assistantId) });
      }
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: (dto: CreateAssistantDto) => assistants.create(dto),
    onSuccess: (assistant) => invalidateAssistants(assistant.id),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAssistantDto }) => {
      if (!id) {
        throw new Error('updateAssistant called with empty id');
      }

      return assistants.update(id, patch);
    },
    onSuccess: (assistant) => invalidateAssistants(assistant.id),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assistants.remove(id),
    onSuccess: (_data, id) => invalidateAssistants(id),
  });

  const createAssistant = useCallback(
    (dto: CreateAssistantDto) => createMutation.mutateAsync(dto),
    [createMutation],
  );

  const updateAssistant = useCallback(
    (id: string, patch: UpdateAssistantDto) => updateMutation.mutateAsync({ id, patch }),
    [updateMutation],
  );

  const deleteAssistant = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  return {
    createAssistant,
    updateAssistant,
    deleteAssistant,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
