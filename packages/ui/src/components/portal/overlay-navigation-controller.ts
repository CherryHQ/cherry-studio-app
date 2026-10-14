/** Registrations last until the owner has finished dismissal or unmounted. */
export function createOverlayNavigation() {
  const overlays = new Map<symbol, (() => void) | undefined>();
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of [...listeners]) listener();
  }
  return {
    register(dismiss?: () => void) {
      const id = Symbol();
      overlays.set(id, dismiss);
      notify();
      return () => {
        overlays.delete(id);
        notify();
      };
    },
    /** Never decide on the user's behalf; a new surface also cancels the handoff. */
    prepareForNavigation(signal: AbortSignal): Promise<boolean> {
      if (signal.aborted || [...overlays.values()].some((dismiss) => !dismiss)) {
        return Promise.resolve(false);
      }
      const current = new Map(overlays);
      return new Promise((resolve) => {
        function finish(ready: boolean) {
          listeners.delete(check);
          signal.removeEventListener('abort', abort);
          resolve(ready);
        }
        function abort() {
          finish(false);
        }
        function check() {
          if (signal.aborted || [...overlays.keys()].some((id) => !current.has(id))) {
            finish(false);
          } else if (overlays.size === 0) {
            // A close may open another surface in the same React commit. Let its
            // layout effect register before admitting navigation.
            queueMicrotask(() => {
              if (overlays.size === 0 && !signal.aborted) finish(true);
            });
          }
        }
        listeners.add(check);
        signal.addEventListener('abort', abort, { once: true });
        try {
          for (const [id, dismiss] of current) {
            if (signal.aborted || [...overlays.keys()].some((key) => !current.has(key))) break;
            if (overlays.has(id)) dismiss?.();
          }
          check();
        } catch {
          finish(false);
        }
      });
    },
  };
}
