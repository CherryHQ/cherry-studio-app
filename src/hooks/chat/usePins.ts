import { useCallback, useMemo, useRef } from 'react';

import { queryKeys } from '@/data/api';
import { useDataMutation, useDataQuery } from '@/data/hooks';
import type { EntityType } from '@/data/types/entityType';
import type { CreatePinDto, Pin } from '@/data/types/pin';

const EMPTY_PINS: readonly Pin[] = Object.freeze([]);

export function usePins(entityType: EntityType) {
  const listQueryKey = queryKeys.pins.list({ entityType });
  const pinsQuery = useDataQuery({
    queryFn: (services) => services.pin.listByEntityType(entityType),
    queryKey: listQueryKey,
  });
  const createPinMutation = useDataMutation({
    invalidateQueries: [listQueryKey],
    mutationFn: (services, dto: CreatePinDto) => services.pin.pin(dto),
  });
  const deletePinMutation = useDataMutation({
    invalidateQueries: [listQueryKey],
    mutationFn: (services, id: string) => services.pin.unpin(id),
  });
  const toggleInFlightRef = useRef(false);
  const pins = pinsQuery.data ?? EMPTY_PINS;
  const pinnedIds = useMemo(() => pins.map((pin) => pin.entityId), [pins]);
  const isMutating = createPinMutation.isPending || deletePinMutation.isPending;
  const isRefreshing = pinsQuery.isFetching && !pinsQuery.isLoading;
  const error = pinsQuery.error ?? createPinMutation.error ?? deletePinMutation.error;

  const togglePin = useCallback(
    async (entityId: string) => {
      if (pinsQuery.isLoading || isRefreshing || isMutating || toggleInFlightRef.current) {
        return;
      }

      toggleInFlightRef.current = true;
      const existing = pins.find((pin) => pin.entityId === entityId);
      const mutation = existing
        ? deletePinMutation.mutateAsync(existing.id)
        : createPinMutation.mutateAsync({ entityId, entityType });
      await mutation.finally(() => {
        toggleInFlightRef.current = false;
      });
    },
    [
      createPinMutation,
      deletePinMutation,
      entityType,
      isMutating,
      isRefreshing,
      pins,
      pinsQuery.isLoading,
    ],
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
