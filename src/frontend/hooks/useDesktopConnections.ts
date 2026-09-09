import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBackendModule, useQuery } from '@/frontend/data';
import type {
  DesktopImportSelectionsDto,
  PairDesktopConnectionDto,
} from '@/shared/data/api/schemas/desktopConnections';
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

type Operation = 'pair' | 'remove' | 'preview' | 'import';

export function useDesktopConnectionActions() {
  const connections = useBackendModule('desktopConnections');
  const queryClient = useQueryClient();
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [connections]);

  const run = useCallback(
    async <T>(
      kind: Operation,
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<T | undefined> => {
      // Scan callbacks and repeated taps may arrive before React updates loading state.
      if (!mounted.current || request.current) return undefined;
      const controller = new AbortController();
      request.current = controller;
      setPending(kind);
      try {
        let result: T;
        try {
          result = await operation(controller.signal);
        } finally {
          // Authorization failures also change connection status. Import may have
          // committed immediately before unmount, so always invalidate affected reads.
          const roots =
            kind === 'import'
              ? ['/desktop-connections', '/providers', '/models']
              : ['/desktop-connections'];
          await queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              typeof queryKey[0] === 'string' &&
              roots.some(
                (root) => queryKey[0] === root || (queryKey[0] as string).startsWith(root + '/'),
              ),
          });
        }
        return controller.signal.aborted ? undefined : result;
      } catch (error) {
        if (controller.signal.aborted) return undefined;
        throw error;
      } finally {
        if (request.current === controller) {
          request.current = null;
          setPending(null);
        }
      }
    },
    [queryClient],
  );

  const pair = useCallback(
    (input: PairDesktopConnectionDto) => run('pair', (signal) => connections.pair(input, signal)),
    [connections, run],
  );
  const remove = useCallback(
    (id: string) =>
      run('remove', async (signal) => {
        await connections.remove(id, signal);
        return true;
      }),
    [connections, run],
  );
  const preview = useCallback(
    (id: string) => run('preview', (signal) => connections.preview(id, signal)),
    [connections, run],
  );
  const importSelected = useCallback(
    (id: string, input: DesktopImportSelectionsDto) =>
      run('import', (signal) => connections.import(id, input, signal)),
    [connections, run],
  );

  return {
    isPairing: pending === 'pair',
    isRemoving: pending === 'remove',
    isPreviewing: pending === 'preview',
    isImporting: pending === 'import',
    pair,
    remove,
    preview,
    importSelected,
  };
}
