import { useCallback } from 'react';

import { useMutation, useQuery } from '@/frontend/data';
import type { PairDesktopConnectionDto } from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

const EMPTY_CONNECTIONS: readonly DesktopConnection[] = Object.freeze([]);

export function useDesktopConnections() {
  const query = useQuery('/desktop-connections');
  return {
    connections: query.data?.items ?? EMPTY_CONNECTIONS,
    error: query.error,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useDesktopConnection(id: string | undefined) {
  const query = useQuery('/desktop-connections/:id', {
    enabled: Boolean(id),
    params: { id: id ?? '' },
  });
  return {
    connection: query.data,
    error: query.error,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useDesktopConnectionActions() {
  const pairMutation = useMutation('POST', '/desktop-connections', {
    refresh: ['/desktop-connections', '/desktop-connections/*'],
  });
  const removeMutation = useMutation('DELETE', '/desktop-connections/:id', {
    refresh: ['/desktop-connections', '/desktop-connections/*'],
  });
  const pairRequest = pairMutation.trigger;
  const removeRequest = removeMutation.trigger;

  const pair = useCallback(
    (body: PairDesktopConnectionDto) => pairRequest({ body }),
    [pairRequest],
  );
  const remove = useCallback(
    async (id: string) => {
      await removeRequest({ params: { id } });
    },
    [removeRequest],
  );

  return {
    isPairing: pairMutation.isLoading,
    isRemoving: removeMutation.isLoading,
    pair,
    remove,
  };
}
