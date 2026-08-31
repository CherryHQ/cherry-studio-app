import {
  type CatalogManifest,
  CatalogManifestSchema,
  type RemoteRegistryFileName,
} from '@cherrystudio/provider-registry/mobile';
import { Directory, File, Paths } from 'expo-file-system';
import * as z from 'zod';

export type BundledRegistryVersions = {
  models: string;
  providerModels: string;
};

type ProviderRegistrySnapshot = {
  files: Record<RemoteRegistryFileName, string>;
  manifest: CatalogManifest;
};

// v2 is populated only by an explicit user-approved update. The directory
// boundary prevents older automatically downloaded snapshots from activating.
const SNAPSHOT_DIRECTORY_NAME = 'provider-registry-v2';
const SNAPSHOT_MARKER_NAME = 'snapshot.json';

const SnapshotMarkerSchema = z.object({
  bundledVersions: z.object({
    models: z.string(),
    providerModels: z.string(),
  }),
  manifest: CatalogManifestSchema,
});

function snapshotDirectory(): Directory {
  return new Directory(Paths.cache, SNAPSHOT_DIRECTORY_NAME);
}

function snapshotFile(name: string): File {
  return new File(snapshotDirectory(), name);
}

function snapshotMarker(): File {
  return snapshotFile(SNAPSHOT_MARKER_NAME);
}

function matchesBundledVersions(
  left: BundledRegistryVersions,
  right: BundledRegistryVersions,
): boolean {
  return left.models === right.models && left.providerModels === right.providerModels;
}

export async function readProviderRegistrySnapshot(
  bundledVersions: BundledRegistryVersions,
): Promise<ProviderRegistrySnapshot | null> {
  const markerFile = snapshotMarker();
  if (!markerFile.exists) {
    return null;
  }

  const marker = SnapshotMarkerSchema.parse(JSON.parse(await markerFile.text()));
  if (!matchesBundledVersions(marker.bundledVersions, bundledVersions)) {
    markerFile.delete();
    return null;
  }

  const modelsFile = snapshotFile('models.json');
  const providerModelsFile = snapshotFile('provider-models.json');
  if (!modelsFile.exists || !providerModelsFile.exists) {
    markerFile.delete();
    return null;
  }

  const [models, providerModels] = await Promise.all([
    modelsFile.text(),
    providerModelsFile.text(),
  ]);

  return {
    files: {
      'models.json': models,
      'provider-models.json': providerModels,
    },
    manifest: marker.manifest,
  };
}

/** Persist the payload first and activate the complete set by writing its marker last. */
export async function writeProviderRegistrySnapshot(
  files: Record<RemoteRegistryFileName, string>,
  manifest: CatalogManifest,
  bundledVersions: BundledRegistryVersions,
): Promise<void> {
  const directory = snapshotDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  invalidateProviderRegistrySnapshot();

  await atomicWrite(snapshotFile('models.json'), files['models.json']);
  await atomicWrite(snapshotFile('provider-models.json'), files['provider-models.json']);
  await atomicWrite(snapshotMarker(), JSON.stringify({ bundledVersions, manifest }, undefined, 2));
}

export function invalidateProviderRegistrySnapshot(): void {
  const marker = snapshotMarker();
  if (marker.exists) {
    marker.delete();
  }
}

async function atomicWrite(destination: File, body: string): Promise<void> {
  const temporary = new File(destination.parentDirectory, `${destination.name}.tmp`);
  temporary.create({ overwrite: true });
  temporary.write(body);
  await temporary.move(destination, { overwrite: true });
}
