import { loggerService } from '@logger';
import { File, Paths } from 'expo-file-system';
import * as z from 'zod';

import {
  type CatalogManifest,
  CatalogManifestSchema,
  type MobileRemoteRegistrySnapshot,
  PARSED_REGISTRY_CACHE_VERSION,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  type RemoteRegistryFileName,
} from '@/backend/data/services/MobileRegistryLoader';

const logger = loggerService.withContext('ProviderRegistrySnapshot');
const SnapshotSchema = z.object({
  files: z.object({ 'models.json': z.string(), 'provider-models.json': z.string() }),
  manifest: CatalogManifestSchema,
});
const ActiveSlotPointerSchema = z.object({
  revision: z.number(),
  schemaVersion: z.number(),
  slot: z.enum(['a', 'b']),
});
const ParsedCacheEnvelopeSchema = z.object({
  cacheVersion: z.number(),
  desktopCompatibilityVersion: z.string(),
  manifest: CatalogManifestSchema,
  snapshot: z.unknown(),
});
const slots = ['a', 'b'] as const;
export type SnapshotSlot = (typeof slots)[number];
export type ActiveProviderRegistrySlot = z.infer<typeof ActiveSlotPointerSchema>;
export type ProviderRegistrySnapshot = z.infer<typeof SnapshotSchema> & { slot: SnapshotSlot };
export type ParsedProviderRegistryCache = {
  cacheVersion: number;
  desktopCompatibilityVersion: string;
  manifest: CatalogManifest;
  slot: SnapshotSlot;
  snapshot: unknown;
};

function snapshotFile(slot: SnapshotSlot): File {
  return new File(Paths.document, 'provider-registry', `snapshot-${slot}.json`);
}

function parsedCacheFile(slot: SnapshotSlot): File {
  return new File(Paths.document, 'provider-registry', `parsed-${slot}.json`);
}

function activeSlotFile(): File {
  return new File(Paths.document, 'provider-registry', 'active-slot.json');
}

async function writeJsonAtomically(destination: File, body: string): Promise<void> {
  destination.parentDirectory.create({ intermediates: true, idempotent: true });
  const temporary = new File(destination.parentDirectory, `${destination.name}.tmp`);
  temporary.create({ overwrite: true });
  temporary.writeSync(body);
  await temporary.move(destination, { overwrite: true });
}

export async function readActiveProviderRegistrySlot(): Promise<ActiveProviderRegistrySlot | null> {
  const file = activeSlotFile();
  if (!file.exists) return null;
  try {
    return ActiveSlotPointerSchema.parse(JSON.parse(await file.text()));
  } catch (error) {
    logger.warn('Could not read the active registry slot pointer', error as Error);
    return null;
  }
}

export async function readParsedProviderRegistryCache(
  slot: SnapshotSlot,
): Promise<ParsedProviderRegistryCache | null> {
  const file = parsedCacheFile(slot);
  if (!file.exists) return null;
  try {
    const parsed = ParsedCacheEnvelopeSchema.parse(JSON.parse(await file.text()));
    return { ...parsed, slot };
  } catch (error) {
    logger.warn('Could not read parsed registry cache', error as Error, { slot });
    return null;
  }
}

export async function readProviderRegistrySnapshotSlot(
  slot: SnapshotSlot,
): Promise<ProviderRegistrySnapshot | null> {
  const file = snapshotFile(slot);
  if (!file.exists) return null;
  try {
    const snapshot = SnapshotSchema.parse(JSON.parse(await file.text()));
    return { ...snapshot, slot };
  } catch (error) {
    logger.warn('Could not read a saved registry snapshot', error as Error, { slot });
    return null;
  }
}

function deleteFileIfExists(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    logger.warn('Could not delete stale registry cache file', error as Error, { name: file.name });
  }
}

async function writeActiveSlotPointer(
  slot: SnapshotSlot,
  manifest: CatalogManifest,
): Promise<void> {
  try {
    await writeJsonAtomically(
      activeSlotFile(),
      JSON.stringify({
        revision: manifest.revision,
        schemaVersion: manifest.schemaVersion,
        slot,
      }),
    );
  } catch (error) {
    logger.warn('Could not persist active registry slot pointer', error as Error, { slot });
  }
}

/** Persist the already-validated snapshot structure and active slot pointer (best effort). */
export async function writeParsedProviderRegistryCache(
  slot: SnapshotSlot,
  manifest: CatalogManifest,
  snapshot: MobileRemoteRegistrySnapshot,
): Promise<void> {
  try {
    await writeJsonAtomically(
      parsedCacheFile(slot),
      JSON.stringify({
        cacheVersion: PARSED_REGISTRY_CACHE_VERSION,
        desktopCompatibilityVersion: REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
        manifest,
        snapshot,
      }),
    );
  } catch (error) {
    deleteFileIfExists(parsedCacheFile(slot));
    logger.warn('Could not persist parsed registry cache', error as Error, { slot });
  }
  await writeActiveSlotPointer(slot, manifest);
}

/** Return newest first; the updater validates compatibility and both payloads before activation. */
export async function readProviderRegistrySnapshots(): Promise<ProviderRegistrySnapshot[]> {
  const snapshots: ProviderRegistrySnapshot[] = [];
  for (const slot of slots) {
    const snapshot = await readProviderRegistrySnapshotSlot(slot);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots.sort((left, right) => right.manifest.revision - left.manifest.revision);
}

/** Write the inactive slot. Even a partial write or failed move leaves the active slot intact. */
export async function writeProviderRegistrySnapshot(
  files: Record<RemoteRegistryFileName, string>,
  manifest: CatalogManifest,
  activeSlot?: SnapshotSlot,
  parsed?: MobileRemoteRegistrySnapshot,
): Promise<SnapshotSlot> {
  const slot = activeSlot === 'a' ? 'b' : 'a';
  // Clear stale slot cache and pointer before committing the raw snapshot so a failed
  // cache or pointer write falls back to scanning both slots instead of pinning an older revision.
  deleteFileIfExists(parsedCacheFile(slot));
  deleteFileIfExists(activeSlotFile());
  await writeJsonAtomically(snapshotFile(slot), JSON.stringify({ files, manifest }));
  if (parsed) {
    await writeParsedProviderRegistryCache(slot, manifest, parsed);
  } else {
    await writeActiveSlotPointer(slot, manifest);
  }
  return slot;
}
