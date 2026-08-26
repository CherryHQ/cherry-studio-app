import { useQueryClient, useQuery as useTanStackQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queryKeys, useBackendModule, useMutation, useQuery } from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromCountedList,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import type { McpServerRuntimeSummary } from '@/shared/contracts';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@/shared/data/api/schemas/mcpServers';
import type { McpServer } from '@/shared/data/types/mcpServer';

const EMPTY_MCP_SERVERS: readonly McpServer[] = Object.freeze([]);
const EMPTY_MCP_RUNTIME_SUMMARIES: Readonly<Record<string, McpServerRuntimeSummary>> =
  Object.freeze({});
type McpServerListData = { items: McpServer[]; total: number };

export function useMcpServersApi() {
  const query = useQuery('/mcp-servers');

  return {
    servers: query.data?.items ?? EMPTY_MCP_SERVERS,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useMcpServerApiById(id: string | undefined) {
  const query = useQuery('/mcp-servers/:id', {
    enabled: Boolean(id),
    params: { id: id ?? '' },
  });

  return {
    server: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useMcpServerRuntimeSummaries(servers: readonly McpServer[]) {
  const mcp = useBackendModule('mcp');
  const query = useTanStackQuery({
    enabled: servers.length > 0,
    queryFn: () => mcp.getRuntimeSummaries(servers),
    queryKey: queryKeys.mcpServers.runtimeSummaries(servers),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    error: query.error,
    isLoading: query.isLoading,
    query,
    summaries: query.data ?? EMPTY_MCP_RUNTIME_SUMMARIES,
  };
}

export function useMcpServerMutations() {
  const queryClient = useQueryClient();
  const createMutation = useMutation('POST', '/mcp-servers', {
    refresh: ['/mcp-servers'],
    onSuccess: (server) => {
      queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
    },
  });
  const updateMutation = useMutation('PATCH', '/mcp-servers/:id', {
    refresh: ['/mcp-servers'],
    onSuccess: ({ server, toolsChanged }) => {
      queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
      if (toolsChanged) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.tools(server.id) });
      }
    },
  });
  const deleteMutation = useMutation('DELETE', '/mcp-servers/:id', {
    onMutate: async (variables) => {
      const serverId = variables?.params.id;
      const serverIds = new Set(serverId ? [serverId] : []);
      const servers = await updateQueriesOptimistically<McpServerListData>(
        queryClient,
        dataApiCollectionFilters('/mcp-servers'),
        (current) => removeItemsFromCountedList(current, serverIds),
      );

      return { servers };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.servers);
    },
  });
  const createServerRequest = createMutation.trigger;
  const updateServerRequest = updateMutation.trigger;
  const deleteServerRequest = deleteMutation.trigger;

  const createServer = useCallback(
    (dto: CreateMcpServerDto) => createServerRequest({ body: dto }),
    [createServerRequest],
  );
  const updateServer = useCallback(
    async (id: string, patch: UpdateMcpServerDto) =>
      (await updateServerRequest({ body: patch, params: { id } })).server,
    [updateServerRequest],
  );
  const deleteServer = useCallback(
    async (id: string) => {
      await deleteServerRequest({ params: { id } });
      queryClient.removeQueries({ queryKey: queryKeys.mcpServers.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() });
    },
    [deleteServerRequest, queryClient],
  );

  return {
    createServer,
    updateServer,
    deleteServer,
    isCreating: createMutation.isLoading,
    isUpdating: updateMutation.isLoading,
    isDeleting: deleteMutation.isLoading,
  };
}
