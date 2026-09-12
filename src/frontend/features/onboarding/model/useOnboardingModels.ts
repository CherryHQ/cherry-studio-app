import { useQuery as useWorkflowQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { queryKeys, useBackendModule, useQuery } from '@/frontend/data';

import { getOnboardingModelError } from './onboardingModelError';
import { getOnboardingModels } from './onboardingModels';

export function useOnboardingModels(providerId: string | undefined) {
  const modelsModule = useBackendModule('models');
  const queryClient = useQueryClient();
  const local = useQuery('/models', {
    query: { isSystemSupported: true, ...(providerId ? { providerId } : { enabled: true }) },
  });
  const providers = useQuery('/providers');
  const remote = useWorkflowQuery({
    enabled: Boolean(providerId),
    gcTime: 0,
    queryFn: ({ signal }) => {
      if (!providerId) throw new Error('A provider is required to load models');
      return modelsModule.pull(providerId, signal);
    },
    queryKey: queryKeys.models.setup(providerId ?? ''),
    refetchOnWindowFocus: false,
    retry: false,
  });
  useFocusEffect(
    useCallback(
      () => () => {
        if (providerId)
          void queryClient.cancelQueries({ queryKey: queryKeys.models.setup(providerId) });
      },
      [providerId, queryClient],
    ),
  );
  const items = getOnboardingModels({
    local: local.data ?? [],
    providerId,
    providers: providers.data ?? [],
    remote: remote.data?.status === 'changes' ? remote.data.preview.added : [],
  });
  const error = local.error ?? providers.error;
  const pullError = getOnboardingModelError(remote.error);
  const isRefreshing = local.isRefreshing || providers.isRefreshing || remote.isFetching;

  return {
    error,
    // A failed remote list blocks the empty state, but not saved models or manual entry.
    loadError: getOnboardingModelError(error) ?? (items.length === 0 ? pullError : null),
    isLoading:
      local.isPending ||
      providers.isPending ||
      (items.length === 0 && ((Boolean(providerId) && remote.isPending) || isRefreshing)),
    isRefreshing,
    items,
    localModels: local.data ?? [],
    provider: providers.data?.find((provider) => provider.id === providerId),
    providers: providers.data ?? [],
    pullError,
    retry: () => {
      void local.refetch();
      void providers.refetch();
      if (providerId) void remote.refetch();
    },
  };
}
