import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '@/data/api';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@/data/api/schemas/mcpServers';
import { useDataQuery } from '@/data/hooks';
import { useDataServices } from '@/data/runtime';
import type { McpServer } from '@/data/types/mcpServer';

const EMPTY_MCP_SERVERS: readonly McpServer[] = Object.freeze([]);

export function useMcpServersApi() {
  const query = useDataQuery({
    queryFn: (services) => services.mcpServer.list(),
    queryKey: queryKeys.mcpServers.list(),
  });

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
  const enabled = Boolean(id);
  const queryServerId = id ?? '__missing_mcp_server__';
  const query = useDataQuery({
    enabled,
    queryFn: (services) => services.mcpServer.getById(id ?? ''),
    queryKey: queryKeys.mcpServers.detail(queryServerId),
  });

  return {
    server: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    query,
  };
}

export function useMcpServerMutations() {
  const services = useDataServices();
  const queryClient = useQueryClient();

  const invalidateServers = useCallback(
    async (serverId?: string) => {
      // Config changed — drop the runtime client/tools cache before refetching.
      if (serverId) {
        services.mcp.invalidateServer(serverId);
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() });

      if (serverId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.detail(serverId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.tools(serverId) });
      }
    },
    [queryClient, services],
  );

  const createMutation = useMutation({
    mutationFn: (dto: CreateMcpServerDto) => services.mcpServer.create(dto),
    onSuccess: (server) => invalidateServers(server.id),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMcpServerDto }) => {
      if (!id) {
        throw new Error('updateMcpServer called with empty id');
      }

      return services.mcpServer.update(id, patch);
    },
    onSuccess: (server) => invalidateServers(server.id),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.mcpServer.delete(id),
    onSuccess: async (_data, id) => {
      await invalidateServers(id);
      // Junction rows are gone; assistants referencing this server changed too.
      await queryClient.invalidateQueries({ queryKey: queryKeys.assistants.all() });
    },
  });

  const createServer = useCallback(
    (dto: CreateMcpServerDto) => createMutation.mutateAsync(dto),
    [createMutation],
  );

  const updateServer = useCallback(
    (id: string, patch: UpdateMcpServerDto) => updateMutation.mutateAsync({ id, patch }),
    [updateMutation],
  );

  const deleteServer = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation],
  );

  return {
    createServer,
    updateServer,
    deleteServer,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
