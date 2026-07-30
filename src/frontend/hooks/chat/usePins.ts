import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { EntityType } from '@/shared/data/types/entityType';
import type { CreatePinDto, Pin } from '@/shared/data/types/pin';

const EMPTY_PINS: readonly Pin[] = Object.freeze([]);

export function usePins(entityType: EntityType) {
  const pinsBackend = useBackendModule('pins');
  const queryClient = useQueryClient();
  const listQueryKey = queryKeys.pins.list({ entityType });
  const pinsQuery = useQuery({
    queryFn: () => pinsBackend.list(entityType),
    queryKey: listQueryKey,
  });
  const createPinMutation = useMutation({
    mutationFn: (dto: CreatePinDto) => pinsBackend.pin(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listQueryKey }),
  });
  const deletePinMutation = useMutation({
    mutationFn: (id: string) => pinsBackend.unpin(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listQueryKey }),
  });
  const toggleInFlightRef = useRef(false);
  const pins = pinsQuery.data ?? EMPTY_PINS;
  const pinnedIds = useMemo(() => pins.map((pin) => pin.entityId), [pins]);
  const isMutating = createPinMutation.isPending || deletePinMutation.isPending;
  const isRefreshing = pinsQuery.isFetching && !pinsQuery.isLoading;
  const error = pinsQuery.error ?? createPinMutation.error ?? deletePinMutation.error;

  // Depend on the mutations' `mutateAsync` rather than the mutation objects:
  // react-query rebuilds a `useMutation` result object on every render (it
  // spreads the observer result), while `mutateAsync` keeps a stable identity.
  // Depending on the objects rebuilt `togglePin` every render, which in turn
  // invalidated every consumer memo keyed on it.
  const createPin = createPinMutation.mutateAsync;
  const deletePin = deletePinMutation.mutateAsync;
  const togglePin = useCallback(
    async (entityId: string) => {
      if (pinsQuery.isLoading || isRefreshing || isMutating || toggleInFlightRef.current) {
        return;
      }

      toggleInFlightRef.current = true;
      const existing = pins.find((pin) => pin.entityId === entityId);
      const mutation = existing ? deletePin(existing.id) : createPin({ entityId, entityType });
      await mutation.finally(() => {
        toggleInFlightRef.current = false;
      });
    },
    [createPin, deletePin, entityType, isMutating, isRefreshing, pins, pinsQuery.isLoading],
  );

  return {
    pins,
    pinnedIds,
    isLoading: pinsQuery.isLoading,
    isRefreshing,
    isMutating,
    error,
    refetch: pinsQuery.refetch,
    togglePin,
    pinsQuery,
  };
}
