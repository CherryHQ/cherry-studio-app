import type { EntityType } from '@cherrystudio/universal/data/types/entityType';
import type { Pin } from '@cherrystudio/universal/data/types/pin';
import { useCallback, useMemo, useRef } from 'react';

import { useMutation, useQuery } from '@/frontend/data';

const EMPTY_PINS: readonly Pin[] = Object.freeze([]);

export function usePins(entityType: EntityType) {
  const pinsQuery = useQuery('/pins', {
    query: { entityType },
  });
  const createPinMutation = useMutation('POST', '/pins', {
    refresh: ['/pins'],
  });
  const deletePinMutation = useMutation('DELETE', '/pins/:id', {
    refresh: ['/pins'],
  });
  const toggleInFlightRef = useRef(false);
  const pins = pinsQuery.data ?? EMPTY_PINS;
  const pinnedIds = useMemo(() => pins.map((pin) => pin.entityId), [pins]);
  const isMutating = createPinMutation.isLoading || deletePinMutation.isLoading;
  const isRefreshing = pinsQuery.isRefreshing;
  const error = pinsQuery.error ?? createPinMutation.error ?? deletePinMutation.error;

  // Depend on the mutations' `mutateAsync` rather than the mutation objects:
  // react-query rebuilds a `useMutation` result object on every render (it
  // spreads the observer result), while `mutateAsync` keeps a stable identity.
  // Depending on the objects rebuilt `togglePin` every render, which in turn
  // invalidated every consumer memo keyed on it.
  const createPin = createPinMutation.trigger;
  const deletePin = deletePinMutation.trigger;
  const togglePin = useCallback(
    async (entityId: string) => {
      if (pinsQuery.isLoading || isRefreshing || isMutating || toggleInFlightRef.current) {
        return;
      }

      toggleInFlightRef.current = true;
      const existing = pins.find((pin) => pin.entityId === entityId);
      const mutation = existing
        ? deletePin({ params: { id: existing.id } })
        : createPin({ body: { entityId, entityType } });
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
