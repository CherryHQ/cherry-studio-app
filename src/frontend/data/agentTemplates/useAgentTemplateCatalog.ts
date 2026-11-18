import { useQuery, useQueryClient } from '@tanstack/react-query';

import { agentTemplateLanguage } from '@/shared/utils/agentTemplateLanguage';

import { useBackendModule } from '../BackendProvider';

/** Show the saved catalog first; keep it visible if a background refresh fails. */
export function useAgentTemplateCatalog(language: string, enabled = true) {
  const module = useBackendModule('agentTemplates');
  const queryClient = useQueryClient();
  const locale = agentTemplateLanguage(language);
  const cacheKey = ['agent-templates', 'saved', locale] as const;
  const saved = useQuery({
    queryKey: cacheKey,
    queryFn: () => module.readCached(locale),
    enabled,
    networkMode: 'always',
    staleTime: Infinity,
    retry: false,
  });
  const remote = useQuery({
    queryKey: ['agent-templates', 'catalog', locale],
    queryFn: async ({ signal }) => {
      const catalog = await module.refresh(locale, signal);
      queryClient.setQueryData(cacheKey, catalog);
      return catalog;
    },
    enabled: enabled && saved.isFetched,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  });
  const catalog = remote.data ?? saved.data ?? null;
  return {
    catalog,
    isLoading: enabled && !catalog && (saved.isPending || remote.isPending),
    isFetching: remote.isFetching,
    error: remote.error ?? saved.error,
    refetch: remote.refetch,
  };
}
