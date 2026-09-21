import type { SystemAction, SystemEntryModule, SystemSharedFile } from '@/shared/contracts';

import {
  getSystemIntegration,
  nativeSystemEntrySchema,
  type NativeSystemEntry,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';

const STAGING_LIFETIME_MS = 86_400_000;
const CLOCK_SKEW_MS = 60_000;

type Dependencies = {
  importFiles(entry: NativeSystemEntry, signal: AbortSignal): Promise<SystemSharedFile[]>;
  native?: SystemIntegrationNativeModule | null;
};

export function createSystemEntryModule(dependencies: Dependencies): {
  module: SystemEntryModule;
  dispose(): Promise<void>;
} {
  const native = dependencies.native === undefined ? getSystemIntegration() : dependencies.native;
  const claims = new Set<{ controller: AbortController; settled: Promise<void> }>();
  let disposed = false;

  return {
    module: {
      subscribePending(listener) {
        const subscription = native?.addListener('onPending', listener);
        return () => subscription?.remove();
      },
      async claimNext(): Promise<SystemAction | null> {
        if (!native || disposed) return null;
        while (true) {
          const value = await native.claimNextEntry();
          if (!value) return null;
          const parsed = nativeSystemEntrySchema.safeParse(value);
          if (
            !parsed.success ||
            Date.now() - value.createdAt > STAGING_LIFETIME_MS ||
            value.createdAt > Date.now() + CLOCK_SKEW_MS
          ) {
            // The native store has already constrained file URIs to its private staging directory.
            // Dropping one invalid entry must not strand later valid shares until the next foreground.
            await native.completeEntry(value.id);
            continue;
          }
          if (disposed) {
            await native.releaseEntry(value.id);
            return null;
          }
          return await importClaim(parsed.data);
        }
      },
    },
    async dispose() {
      disposed = true;
      for (const claim of claims) claim.controller.abort();
      await Promise.allSettled([...claims].map((claim) => claim.settled));
    },
  };

  async function importClaim(entry: NativeSystemEntry): Promise<SystemAction> {
    const controller = new AbortController();
    let settle!: () => void;
    const claim = {
      controller,
      settled: new Promise<void>((resolve) => {
        settle = resolve;
      }),
    };
    claims.add(claim);
    try {
      const files = await dependencies.importFiles(entry, controller.signal);
      // Staging has no further role once every attachment belongs to the library.
      await native!.completeEntry(entry.id);
      return { kind: 'share.receive', text: entry.text, files };
    } catch {
      // An interrupted import leaves the share staged. Its next claim re-imports every
      // attachment, which can leave a duplicate of one that had already landed.
      await native!.releaseEntry(entry.id).catch(() => {});
      throw new Error('System share import failed');
    } finally {
      claims.delete(claim);
      settle();
    }
  }
}
