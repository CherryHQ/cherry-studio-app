import type { UpdateProviderInput } from '@cherrystudio/universal/data/api/schemas/providers';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useMutation, useQuery } from '@/frontend/data';
import {
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';

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
    refresh: ['/providers', `/providers/${providerId}`, `/providers/${providerId}/auth`],
  });
  const replaceMutation = useMutation('PUT', '/providers/:id/api-keys', {
    onMutate: async (variables) => {
      const apiKeys = await updateQueriesOptimistically<ApiKeyEntry[]>(
        queryClient,
        { exact: true, queryKey: [`/providers/${providerId}/api-keys`] },
        (current) => variables?.body ?? current,
      );

      return { apiKeys };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.apiKeys);
    },
    refresh: ['/providers', `/providers/${providerId}`, `/providers/${providerId}/api-keys`],
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
