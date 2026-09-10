import {
  type CatalogManifest,
  CatalogManifestSchema,
  type RemoteRegistryFileName,
} from '@cherrystudio/provider-registry/mobile';
import { loggerService } from '@logger';
import { Directory, File, Paths } from 'expo-file-system';
import * as z from 'zod';

const logger = loggerService.withContext('ProviderRegistrySnapshot');
const SnapshotSchema = z.object({
  files: z.object({ 'models.json': z.string(), 'provider-models.json': z.string() }),
  manifest: CatalogManifestSchema,
});
const slots = ['a', 'b'] as const;
type SnapshotSlot = (typeof slots)[number] | 'legacy';
export type ProviderRegistrySnapshot = z.infer<typeof SnapshotSchema> & { slot: SnapshotSlot };

function snapshotFile(slot: SnapshotSlot): File {
  return slot === 'legacy'
    ? new File(Paths.cache, 'provider-registry-v2', 'snapshot.json')
    : new File(Paths.document, 'provider-registry', `snapshot-${slot}.json`);
}

/** Return newest first; the updater validates compatibility and both payloads before activation. */
export async function readProviderRegistrySnapshots(): Promise<ProviderRegistrySnapshot[]> {
  const snapshots: ProviderRegistrySnapshot[] = [];
  for (const slot of [...slots, 'legacy'] as const) {
    const file = snapshotFile(slot);
    if (!file.exists) continue;
    try {
      let snapshot: z.infer<typeof SnapshotSchema>;
      if (slot === 'legacy') {
        const { manifest } = z
          .object({ manifest: CatalogManifestSchema })
          .parse(JSON.parse(await file.text()));
        const directory = new Directory(Paths.cache, 'provider-registry-v2');
        const [models, providerModels] = await Promise.all([
          new File(directory, 'models.json').text(),
          new File(directory, 'provider-models.json').text(),
        ]);
        snapshot = {
          files: { 'models.json': models, 'provider-models.json': providerModels },
          manifest,
        };
      } else {
        snapshot = SnapshotSchema.parse(JSON.parse(await file.text()));
      }
      snapshots.push({ ...snapshot, slot });
    } catch (error) {
      logger.warn('Could not read a saved registry snapshot', error as Error, { slot });
    }
  }
  return snapshots.sort((left, right) => right.manifest.revision - left.manifest.revision);
}

/** Write the inactive slot. Even a partial write or failed move leaves the active slot intact. */
export async function writeProviderRegistrySnapshot(
  files: Record<RemoteRegistryFileName, string>,
  manifest: CatalogManifest,
  activeSlot?: SnapshotSlot,
): Promise<SnapshotSlot> {
  const slot = activeSlot === 'a' ? 'b' : 'a';
  const destination = snapshotFile(slot);
  destination.parentDirectory.create({ intermediates: true, idempotent: true });
  const temporary = new File(destination.parentDirectory, `${destination.name}.tmp`);
  temporary.create({ overwrite: true });
  temporary.write(JSON.stringify({ files, manifest }));
  await temporary.move(destination, { overwrite: true });
  return slot;
}
