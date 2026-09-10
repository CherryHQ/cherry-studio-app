import {
  type CatalogManifest,
  CatalogManifestSchema,
  isCatalogManifestCompatible,
  REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
  REGISTRY_SCHEMA_VERSION,
  REMOTE_REGISTRY_FILES,
  type RemoteRegistryFileName,
} from '@cherrystudio/provider-registry/mobile';
import { loggerService } from '@logger';
import { getCalendars, getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { createHttpClient, isHttpError } from '@/backend/services/http';
import type { ProviderRegistryUpdateResult } from '@/shared/contracts';

import {
  type ProviderRegistrySnapshot,
  readProviderRegistrySnapshots,
  writeProviderRegistrySnapshot,
} from './providerRegistrySnapshot';
import { providerRegistryUpdates } from './providerRegistryUpdates';

const logger = loggerService.withContext('ProviderRegistryUpdaterService');

const REMOTE_BRANCH = 'x-files/provider-registry';
const REMOTE_SUBPATH = `v${REGISTRY_SCHEMA_VERSION}`;
const REGISTRY_SOURCES = {
  gitcode: `https://raw.gitcode.com/CherryHQ/cherry-studio/raw/${encodeURIComponent(REMOTE_BRANCH)}/${REMOTE_SUBPATH}`,
  github: `https://raw.githubusercontent.com/CherryHQ/cherry-studio/refs/heads/${REMOTE_BRANCH}/${REMOTE_SUBPATH}`,
} as const;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_REGISTRY_FILE_BYTES = 5 * 1024 * 1024;

const REGISTRY_HTTP_CLIENTS = {
  gitcode: createHttpClient({
    baseUrl: REGISTRY_SOURCES.gitcode,
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    timeoutMs: REQUEST_TIMEOUT_MS,
  }),
  github: createHttpClient({
    baseUrl: REGISTRY_SOURCES.github,
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    timeoutMs: REQUEST_TIMEOUT_MS,
  }),
} as const;

type RegistryNetworkSource = Exclude<keyof typeof REGISTRY_SOURCES, 'cache'>;

type StagedSnapshot = {
  files: Record<RemoteRegistryFileName, string>;
  manifest: CatalogManifest;
  parsed: ReturnType<typeof providerRegistryService.parseRemoteSnapshot>;
};

/**
 * Checks and applies model metadata from the desktop-published registry lane.
 *
 * The payload is unsigned, so `providers.json` deliberately remains bundled:
 * remote data can improve model descriptions and capabilities, but can never
 * redirect credentials or change a provider's API destination. Startup restores
 * the persistent snapshot and downloads one only when none is saved. Later
 * refreshes happen when the user opens a provider's model list.
 */
@Injectable('ProviderRegistryUpdaterService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('not-applicable')
export class ProviderRegistryUpdaterService extends BaseService {
  private activeManifest: CatalogManifest | undefined;
  private activeSlot: ProviderRegistrySnapshot['slot'] | undefined;
  private applyInFlight: Promise<ProviderRegistryUpdateResult> | undefined;
  private readonly requestControllers = new Set<AbortController>();
  private stopped = false;
  private cacheInFlight: Promise<void> | undefined;

  protected async onReady(): Promise<void> {
    this.stopped = false;
    await this.restoreSnapshot();
    if (this.stopped || providerRegistryService.isReady()) {
      return;
    }
    void this.applyUpdate().catch((error: unknown) => {
      if (!this.stopped) {
        logger.warn('Could not download the model registry; model use will retry', toError(error));
      }
    });
  }

  /** Shared by model-selection surfaces so first download is deduplicated and retryable. */
  public async ensureReady(): Promise<void> {
    await this.restoreSnapshot();
    if (!providerRegistryService.isReady()) {
      await this.applyUpdate();
    }
    if (!providerRegistryService.isReady()) {
      throw new Error('No compatible model registry is available');
    }
  }

  private restoreSnapshot(): Promise<void> {
    this.cacheInFlight ??=
      Platform.OS === 'web'
        ? Promise.resolve()
        : this.activateCachedSnapshot().catch((error: unknown) => {
            logger.warn(
              'Could not restore the model registry; a download is required',
              toError(error),
            );
          });
    return this.cacheInFlight;
  }

  /** Download and activate a newer compatible registry snapshot when the remote lane has one. */
  public applyUpdate(): Promise<ProviderRegistryUpdateResult> {
    if (this.applyInFlight) {
      return this.applyInFlight;
    }

    this.applyInFlight = this.runApplyUpdate().finally(() => {
      this.applyInFlight = undefined;
    });
    return this.applyInFlight;
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    for (const controller of this.requestControllers) {
      controller.abort();
    }
    await Promise.allSettled([this.cacheInFlight, this.applyInFlight]);
    this.cacheInFlight = undefined;
    this.activeManifest = undefined;
    this.activeSlot = undefined;
    providerRegistryService.clearRemoteSnapshot();
    providerRegistryUpdates.clear();
  }

  private async activateCachedSnapshot(): Promise<void> {
    const snapshots = await readProviderRegistrySnapshots();
    for (const snapshot of snapshots) {
      if (this.stopped) return;
      try {
        this.assertStructurallyCompatibleManifest(snapshot.manifest);
        if (!isCatalogManifestCompatible(snapshot.manifest)) continue;
        const parsed = this.parseAndValidateFiles(snapshot.files, snapshot.manifest);
        this.activeSlot = snapshot.slot;
        if (snapshot.slot === 'legacy') {
          try {
            this.activeSlot = await writeProviderRegistrySnapshot(
              snapshot.files,
              snapshot.manifest,
              snapshot.slot,
            );
          } catch (error) {
            logger.warn(
              'Could not migrate the registry; using the validated cache',
              toError(error),
            );
          }
        }
        if (this.stopped) return;
        providerRegistryService.installRemoteSnapshot(parsed);
        this.activeManifest = snapshot.manifest;
        providerRegistryUpdates.emit({ revision: snapshot.manifest.revision, source: 'cache' });
        return;
      } catch (error) {
        logger.warn(
          'Saved registry snapshot is unusable; trying the previous snapshot',
          toError(error),
        );
      }
    }
  }

  /** The first reachable source whose manifest is newer than the active snapshot. */
  private async findAvailableUpdate(): Promise<RegistryNetworkSource | undefined> {
    let reachedSource = false;
    let lastError: Error | undefined;

    for (const source of this.getSourceOrder()) {
      if (this.stopped) {
        return undefined;
      }

      try {
        const manifest = await this.fetchManifest(source);
        reachedSource = true;
        if (!manifest) {
          continue;
        }
        if (this.isUpdateAvailable(manifest)) {
          return source;
        }
      } catch (error) {
        lastError = toError(error);
        if (!this.stopped) {
          logger.warn('Registry update check failed; trying the fallback source', lastError, {
            source,
          });
        }
      }
    }

    if ((!reachedSource || !providerRegistryService.isReady()) && !this.stopped) {
      throw lastError ?? new Error('No provider registry source is available');
    }
    return undefined;
  }

  private async runApplyUpdate(): Promise<ProviderRegistryUpdateResult> {
    await this.restoreSnapshot();
    const preferredSource = await this.findAvailableUpdate();
    if (!preferredSource) {
      return this.getCurrentUpdateStatus();
    }

    const sources = [
      preferredSource,
      ...this.getSourceOrder().filter((source) => source !== preferredSource),
    ];
    let lastError: Error | undefined;

    for (const source of sources) {
      if (this.stopped) {
        return this.getCurrentUpdateStatus();
      }

      try {
        const staged = await this.fetchAndValidate(source);
        if (!staged) {
          continue;
        }

        await this.applySnapshot(staged, source);
        return { status: 'updated' };
      } catch (error) {
        lastError = toError(error);
        if (!this.stopped) {
          logger.warn('Registry update failed; trying the fallback source', lastError, { source });
        }
      }
    }

    if (lastError && !this.stopped) {
      throw lastError;
    }
    return this.getCurrentUpdateStatus();
  }

  private async applySnapshot(
    staged: StagedSnapshot,
    source: RegistryNetworkSource,
  ): Promise<void> {
    if (Platform.OS !== 'web') {
      this.activeSlot = await writeProviderRegistrySnapshot(
        staged.files,
        staged.manifest,
        this.activeSlot,
      );
    }
    if (this.stopped) {
      return;
    }

    providerRegistryService.installRemoteSnapshot(staged.parsed);
    this.activeManifest = staged.manifest;
    providerRegistryUpdates.emit({ revision: staged.manifest.revision, source });
    logger.info('Registry snapshot applied', {
      revision: staged.manifest.revision,
      source,
    });
  }

  private async fetchAndValidate(source: RegistryNetworkSource): Promise<StagedSnapshot | null> {
    const manifest = await this.fetchManifest(source);
    if (!manifest || !this.isUpdateAvailable(manifest)) {
      return null;
    }

    const [models, providerModels] = await Promise.all([
      this.fetchText(source, 'models.json', MAX_REGISTRY_FILE_BYTES),
      this.fetchText(source, 'provider-models.json', MAX_REGISTRY_FILE_BYTES),
    ]);
    const files = {
      'models.json': models,
      'provider-models.json': providerModels,
    } satisfies Record<RemoteRegistryFileName, string>;

    return {
      files,
      manifest,
      parsed: this.parseAndValidateFiles(files, manifest),
    };
  }

  private async fetchManifest(source: RegistryNetworkSource): Promise<CatalogManifest | null> {
    const manifestBody = await this.fetchText(source, 'manifest.json', MAX_MANIFEST_BYTES);
    const manifest = CatalogManifestSchema.parse(JSON.parse(manifestBody));
    this.assertStructurallyCompatibleManifest(manifest);
    if (!isCatalogManifestCompatible(manifest)) {
      logger.info('Registry snapshot requires unsupported runtime semantics; skipping', {
        implementedDesktopVersion: REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
        minAppVersion: manifest.minAppVersion,
        sourceAppVersion: manifest.sourceAppVersion,
      });
      return null;
    }
    return manifest;
  }

  private isUpdateAvailable(manifest: CatalogManifest): boolean {
    if (this.activeManifest && manifest.revision <= this.activeManifest.revision) {
      return false;
    }

    return REMOTE_REGISTRY_FILES.some(
      (file) => providerRegistryService.getCatalogVersion(file) !== manifest.files[file],
    );
  }

  private getCurrentUpdateStatus(): { status: 'current' } {
    return { status: 'current' };
  }

  private assertStructurallyCompatibleManifest(manifest: CatalogManifest): void {
    if (manifest.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported registry schema ${manifest.schemaVersion}; expected ${REGISTRY_SCHEMA_VERSION}`,
      );
    }

    for (const file of REMOTE_REGISTRY_FILES) {
      if (!manifest.files[file]) {
        throw new Error(`Registry manifest is missing ${file}`);
      }
    }
  }

  private parseAndValidateFiles(
    files: Record<RemoteRegistryFileName, string>,
    manifest: CatalogManifest,
  ): ReturnType<typeof providerRegistryService.parseRemoteSnapshot> {
    const parsed = providerRegistryService.parseRemoteSnapshot({
      models: JSON.parse(files['models.json']),
      providerModels: JSON.parse(files['provider-models.json']),
    });

    if (parsed.models.version !== manifest.files['models.json']) {
      throw new Error('models.json version does not match the registry manifest');
    }
    if (parsed.providerModels.version !== manifest.files['provider-models.json']) {
      throw new Error('provider-models.json version does not match the registry manifest');
    }

    return parsed;
  }

  private async fetchText(
    source: RegistryNetworkSource,
    name: string,
    maxBytes: number,
  ): Promise<string> {
    const controller = new AbortController();
    this.requestControllers.add(controller);

    try {
      const response = await REGISTRY_HTTP_CLIENTS[source].request<string>({
        errorDecoder: ({ status }) => ({
          message: `${name} returned HTTP ${status}`,
        }),
        maxResponseBytes: maxBytes,
        method: 'GET',
        path: `/${name}`,
        responseType: 'text',
        signal: controller.signal,
      });
      return response.data;
    } catch (error) {
      if (isHttpError(error) && error.code === 'RESPONSE_TOO_LARGE') {
        throw new Error(`${name} exceeds the ${maxBytes}-byte limit`, { cause: error });
      }
      throw error;
    } finally {
      this.requestControllers.delete(controller);
    }
  }

  private getSourceOrder(): RegistryNetworkSource[] {
    const regionCode = getLocales()[0]?.regionCode?.toUpperCase();
    const timeZone = getCalendars()[0]?.timeZone;
    const isChina =
      regionCode === 'CN' || timeZone === 'Asia/Shanghai' || timeZone === 'Asia/Urumqi';
    return isChina ? ['gitcode', 'github'] : ['github', 'gitcode'];
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
