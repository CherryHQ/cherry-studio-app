import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { DesktopPairingProgress } from '@/shared/contracts';
import type { PairDesktopConnectionDto } from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { isMissingPairingConnection } from '../desktopConnectionError';

export function useDesktopPairing(input: PairDesktopConnectionDto | null) {
  const connections = useBackendModule('desktopConnections');
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<DesktopPairingProgress[]>([]);
  const [connection, setConnection] = useState<DesktopConnection>();
  const [error, setError] = useState<unknown>();
  const invalidInput = useRef<PairDesktopConnectionDto | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!input || invalidInput.current === input) return;
      const controller = new AbortController();
      setProgress([]);
      setConnection(undefined);
      setError(undefined);
      void (async () => {
        try {
          const result = await connections.pair(input, controller.signal, (next) => {
            if (!controller.signal.aborted) setProgress((previous) => [...previous, next]);
          });
          if (!controller.signal.aborted) setConnection(result);
        } catch (failure) {
          if (!controller.signal.aborted) {
            if (isMissingPairingConnection(failure)) invalidInput.current = input;
            setError(failure);
          }
        } finally {
          await queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              typeof queryKey[0] === 'string' &&
              (queryKey[0] === '/desktop-connections' ||
                queryKey[0].startsWith('/desktop-connections/')),
          });
        }
      })();
      return () => controller.abort();
    }, [connections, input, queryClient]),
  );

  const repairConnectionId = isMissingPairingConnection(error) ? undefined : input?.connectionId;
  return { connection, error, progress, repairConnectionId };
}
