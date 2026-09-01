import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useMutation, useQuery } from '@/frontend/data';
import {
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import type { UpdateProviderInput } from '@/shared/data/api/schemas/providers';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

export function useProviderApiServiceQueries(providerId: string) {
  const queryClient = useQueryClient();
  const providerQuery = useQuery('/providers/:id', {
    enabled: Boolean(providerId),
    params: { id: providerId },
    retry: false,
  });
  const apiKeysQuery = useQuery('/providers/:id/api-keys', {
    enabled: Boolean(providerId),
    params: { id: providerId },
    retry: false,
  });
  const authConfigQuery = useQuery('/providers/:id/auth', {
    enabled: Boolean(providerId),
    params: { id: providerId },
    retry: false,
  });
  const saveMutation = useMutation('PATCH', '/providers/:id', {
    refresh: ({ args }) => [
      '/models',
      '/providers',
      '/providers/page',
      ...(args ? [`/providers/${args.params.id}`, `/providers/${args.params.id}/auth`] : []),
    ],
  });
  const replaceMutation = useMutation('PUT', '/providers/:id/api-keys', {
    onMutate: async (variables) => {
      const mutationProviderId = variables?.params.id;
      if (!mutationProviderId) {
        return {};
      }

      const apiKeys = await updateQueriesOptimistically<ApiKeyEntry[]>(
        queryClient,
        { exact: true, queryKey: [`/providers/${mutationProviderId}/api-keys`] },
        (current) => variables?.body ?? current,
      );

      return { apiKeys };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.apiKeys);
    },
    refresh: ({ args }) => [
      '/providers',
      '/providers/page',
      ...(args ? [`/providers/${args.params.id}`, `/providers/${args.params.id}/api-keys`] : []),
    ],
  });
  const saveProviderRequest = saveMutation.trigger;
  const replaceApiKeysRequest = replaceMutation.trigger;
  const saveProvider = useCallback(
    (updates: UpdateProviderInput) =>
      saveProviderRequest({ body: updates, params: { id: providerId } }),
    [providerId, saveProviderRequest],
  );
  const replaceApiKeys = useCallback(
    (apiKeys: ApiKeyEntry[]) =>
      replaceApiKeysRequest({ body: apiKeys, params: { id: providerId } }),
    [providerId, replaceApiKeysRequest],
  );
  const saveProviderMutation = useMemo(() => ({ mutateAsync: saveProvider }), [saveProvider]);
  const replaceApiKeysMutation = useMemo(() => ({ mutateAsync: replaceApiKeys }), [replaceApiKeys]);

  return {
    apiKeys: apiKeysQuery.data,
    apiKeysQuery,
    authConfig: authConfigQuery.data,
    authConfigQuery,
    isSaving: saveMutation.isLoading || replaceMutation.isLoading,
    provider: providerQuery.data,
    providerQuery,
    replaceApiKeysMutation,
    saveProviderMutation,
  };
}
