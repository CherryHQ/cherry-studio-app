import { type QueryFilters, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useApiClient } from '../DataApiProvider';
import {
  type QuerySnapshot,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '../utils/optimisticQueryUpdate';
import {
  applySublistOrderToCacheData,
  computeMinimalMoves,
  reorderLocally,
} from '../utils/reorder';

export type ReorderResource = '/agents' | '/models' | '/providers';

export type UseReorderOptions<TItem> = {
  getId: (item: TItem) => string;
  invalidateFilters?: readonly QueryFilters[];
  onError?: (error: unknown) => void;
  queryFilters: readonly QueryFilters[];
  resource: ReorderResource;
};

/**
 * Optimistic list reordering backed by fractional-indexing Data API endpoints.
 * Emits minimal anchor moves, updates every matching
 * TanStack Query cache immediately, serializes queued drags, and rolls back on failure.
 */
export function useReorder<TItem>({
  getId,
  invalidateFilters,
  onError,
  queryFilters,
  resource,
}: UseReorderOptions<TItem>) {
  const dataApi = useApiClient();
  const queryClient = useQueryClient();
  const [inFlightCount, setInFlightCount] = useState(0);
  const inFlightCountRef = useRef(0);
  const queueTailRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const cancelledThroughRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const optionsRef = useRef({ getId, invalidateFilters, onError, queryFilters, resource });
  useLayoutEffect(() => {
    optionsRef.current = { getId, invalidateFilters, onError, queryFilters, resource };
  }, [getId, invalidateFilters, onError, queryFilters, resource]);

  const runInvalidations = useCallback(
    async (filters: readonly QueryFilters[]) => {
      await Promise.all(filters.map((filter) => queryClient.invalidateQueries(filter)));
    },
    [queryClient],
  );

  const reorder = useCallback(
    (oldItems: readonly TItem[], newItems: readonly TItem[]): Promise<boolean> => {
      const currentOptions = optionsRef.current;
      let moves: ReturnType<typeof computeMinimalMoves<TItem>>;
      try {
        moves = computeMinimalMoves(oldItems, newItems, currentOptions.getId);
      } catch (error) {
        currentOptions.onError?.(error);
        return Promise.resolve(false);
      }

      if (moves.length === 0) {
        return Promise.resolve(true);
      }

      const orderedIds = newItems.map(currentOptions.getId);
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      const preAppliedSnapshots: QuerySnapshot<unknown>[] | undefined =
        inFlightCountRef.current === 0 ? [] : undefined;
      inFlightCountRef.current += 1;
      if (mountedRef.current) {
        setInFlightCount((count) => count + 1);
      }

      const filtersToUpdate = currentOptions.queryFilters;
      const filtersToInvalidate = currentOptions.invalidateFilters ?? currentOptions.queryFilters;
      const applyOrder = (current: unknown) =>
        applySublistOrderToCacheData<TItem>(current, orderedIds, currentOptions.getId);

      // An idle drop publishes the new row order in the same turn as the gesture handoff.
      let preApplyFailure: { error: unknown } | undefined;
      if (preAppliedSnapshots) {
        try {
          for (const filter of filtersToUpdate) {
            void queryClient.cancelQueries(filter);
            preAppliedSnapshots.push(queryClient.getQueriesData<unknown>(filter));
            queryClient.setQueriesData<unknown>(filter, applyOrder);
          }
        } catch (error) {
          preApplyFailure = { error };
        }
      }

      const task = queueTailRef.current.then(async (): Promise<boolean> => {
        const snapshots = preAppliedSnapshots ?? [];
        try {
          // Queued drags were planned against the optimistic order of the failed write.
          if (generation <= cancelledThroughRef.current) return false;
          if (preApplyFailure) throw preApplyFailure.error;
          if (!preAppliedSnapshots) {
            for (const filter of filtersToUpdate) {
              // Wait sequentially so query cancellations & snapshots stay deterministic across filters.
              const snapshot = await updateQueriesOptimistically<unknown>(
                queryClient,
                filter,
                applyOrder,
              );
              snapshots.push(snapshot);
            }
          }

          if (moves.length === 1) {
            const [move] = moves;
            const id = encodeURIComponent(move.id);
            const path =
              currentOptions.resource === '/models'
                ? `/model-orders/${id}`
                : `${currentOptions.resource}/${id}/order`;
            await dataApi.patch(path as never, { body: move.anchor as never });
          } else {
            const path = `${currentOptions.resource}/order:batch`;
            await dataApi.patch(path as never, { body: { moves } as never });
          }

          if (generationRef.current === generation) {
            await runInvalidations(filtersToInvalidate);
          }
          return true;
        } catch (error) {
          cancelledThroughRef.current = generationRef.current;
          // Unwind writes newest first so overlapping filters restore the original cache state.
          for (const snapshot of snapshots.toReversed()) {
            restoreQuerySnapshot(queryClient, snapshot);
          }
          await runInvalidations(filtersToInvalidate);
          optionsRef.current.onError?.(error);
          return false;
        } finally {
          inFlightCountRef.current -= 1;
          if (mountedRef.current) {
            setInFlightCount((count) => Math.max(0, count - 1));
          }
        }
      });

      queueTailRef.current = task.then(
        () => undefined,
        () => undefined,
      );

      return task;
    },
    [dataApi, queryClient, runInvalidations],
  );

  const reorderIndex = useCallback(
    (items: readonly TItem[], fromIndex: number, toIndex: number): Promise<boolean> =>
      reorder(items, reorderLocally(items, fromIndex, toIndex)),
    [reorder],
  );

  return {
    isPending: inFlightCount > 0,
    reorder,
    reorderIndex,
  };
}
