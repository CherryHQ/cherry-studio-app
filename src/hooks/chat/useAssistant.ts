import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/data/api';
import type { CreateAssistantDto, UpdateAssistantDto } from '@/data/api/schemas/assistants';
import { useDataQuery } from '@/data/hooks';
import { type Assistant } from '@/data/types/assistant';
import { useDataServices } from '@/runtime';

const ASSISTANTS_LIST_LIMIT = 500;
const EMPTY_ASSISTANTS: readonly Assistant[] = Object.freeze([]);

export function useAssistantsApi() {
  const query = useDataQuery({
    queryFn: (services) => services.assistant.list({ limit: ASSISTANTS_LIST_LIMIT }),
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
  const enabled = Boolean(id);
  const queryAssistantId = id ?? '__missing_assistant__';
  const query = useDataQuery({
    enabled,
    queryFn: (services) => services.assistant.getById(id ?? ''),
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
  const services = useDataServices();
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
    mutationFn: (dto: CreateAssistantDto) => services.assistant.create(dto),
    onSuccess: (assistant) => invalidateAssistants(assistant.id),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAssistantDto }) => {
      if (!id) {
        throw new Error('updateAssistant called with empty id');
      }

      return services.assistant.update(id, patch);
    },
    onSuccess: (assistant) => invalidateAssistants(assistant.id),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.assistant.delete(id),
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
