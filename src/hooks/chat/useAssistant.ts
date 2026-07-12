import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/data/api';
import type { CreateAssistantDto, UpdateAssistantDto } from '@/data/api/schemas/assistants';
import { useDataQuery } from '@/data/hooks';
import { useDataServices } from '@/data/runtime';
import { type Assistant, type AssistantSettings } from '@/data/types/assistant';
import type { Model } from '@/data/types/model';

import { useDefaultModel, useModelById } from './useModel';
import {
  reconcileReasoningEffortForModel,
  reconcileWebSearchForModel,
} from './utils/modelReconcile';

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

export function useAssistants() {
  const { assistants, error, isLoading, refetch } = useAssistantsApi();
  const { createAssistant, deleteAssistant, updateAssistant } = useAssistantMutations();

  return {
    assistants,
    isLoading,
    error,
    refetch,
    addAssistant: (dto: CreateAssistantDto) => createAssistant(dto),
    removeAssistant: (id: string) => deleteAssistant(id),
    updateAssistant: (id: string, patch: UpdateAssistantDto) => updateAssistant(id, patch),
  };
}

export function useAssistant(id: string | null | undefined) {
  const { assistant } = useAssistantApiById(id ?? undefined);
  const { updateAssistant: patchAssistant } = useAssistantMutations();
  const { defaultModel } = useDefaultModel();

  const modelId = assistant?.modelId ?? (!id ? defaultModel?.id : undefined);
  const { model } = useModelById(modelId);

  const updateAssistantSettings = useCallback(
    (settings: Partial<AssistantSettings>) => {
      if (!id || !assistant) {
        return;
      }

      void patchAssistant(id, { settings });
    },
    [assistant, id, patchAssistant],
  );

  const setModel = useCallback(
    (next: Model, extraSettings?: Partial<AssistantSettings>) => {
      if (!id || !assistant) {
        return;
      }

      const reasoning = reconcileReasoningEffortForModel(
        next,
        assistant.settings.reasoning_effort,
        id,
      );
      const webSearch = reconcileWebSearchForModel(next, assistant.settings);
      const settingsPatch =
        extraSettings || reasoning || webSearch
          ? { ...assistant.settings, ...extraSettings, ...reasoning, ...webSearch }
          : undefined;

      void patchAssistant(
        id,
        settingsPatch ? { modelId: next.id, settings: settingsPatch } : { modelId: next.id },
      );
    },
    [assistant, id, patchAssistant],
  );

  const updateAssistant = useCallback(
    (patch: UpdateAssistantDto) => {
      if (!id) {
        return Promise.resolve(undefined);
      }

      return patchAssistant(id, patch);
    },
    [id, patchAssistant],
  );

  return {
    assistant,
    model,
    setModel,
    updateAssistant,
    updateAssistantSettings,
  };
}
