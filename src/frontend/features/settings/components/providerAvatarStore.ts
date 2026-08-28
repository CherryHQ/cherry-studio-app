import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

/**
 * Provider avatars live on disk, not in the data API, so nothing invalidates a
 * screen when one changes. This store is that missing signal: resolved uris are
 * cached per provider and dropped on every write, and subscribers re-read.
 * Without it a list row that stayed mounted across the edit screen keeps its old
 * logo, because the lookup is a one-shot file-system stat.
 */
const resolvedUris = new Map<string, string | undefined>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function invalidate(): void {
  resolvedUris.clear();
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Reads a provider's stored custom avatar uri (see `providerAvatarStorage`).
 * The lookup uses the storage module's shared directory index and is cached per
 * `providerId`, so rendering many rows does not rescan the same directory.
 */
export function useProviderAvatar(providerId: string): string | undefined {
  const providers = useBackendModule('providers');
  const getSnapshot = useCallback(() => {
    if (!resolvedUris.has(providerId)) {
      resolvedUris.set(providerId, providers.resolveAvatar(providerId));
    }

    return resolvedUris.get(providerId);
  }, [providerId, providers]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Writing side of {@link useProviderAvatar}. Going through these rather than the
 * backend module directly is what keeps mounted avatars in sync.
 */
export function useProviderAvatarActions() {
  const providers = useBackendModule('providers');

  const persist = useCallback(
    async (providerId: string, sourceUri: string) => {
      const storedUri = await providers.persistAvatar(providerId, sourceUri);
      invalidate();
      return storedUri;
    },
    [providers],
  );

  const remove = useCallback(
    (providerId: string) => {
      providers.removeAvatar(providerId);
      invalidate();
    },
    [providers],
  );

  return useMemo(() => ({ persist, remove }), [persist, remove]);
}
