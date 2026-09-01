import {
  type CatalogManifest,
  CatalogManifestSchema,
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
import type { ProviderRegistryUpdateCheck, ProviderRegistryUpdateResult } from '@/shared/contracts';

import {
  invalidateProviderRegistrySnapshot,
  readProviderRegistrySnapshot,
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
 * redirect credentials or change a provider's API destination. Network checks
 * are requested by the provider catalog screen, and a complete snapshot is
 * downloaded and activated only after an explicit user action.
 */
@Injectable('ProviderRegistryUpdaterService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('not-applicable')
export class ProviderRegistryUpdaterService extends BaseService {
  private activeManifest: CatalogManifest | undefined;
  private availableUpdateSource: RegistryNetworkSource | undefined;
  private applyInFlight: Promise<ProviderRegistryUpdateResult> | undefined;
  private checkInFlight: Promise<void> | undefined;
  private readonly requestControllers = new Set<AbortController>();
  private stopped = false;

  protected async onReady(): Promise<void> {
    this.stopped = false;
    this.activeManifest = undefined;
    this.availableUpdateSource = undefined;
    if (Platform.OS !== 'web') {
      await this.activateCachedSnapshot();
    }
  }

  /** Check the remote manifests without downloading or activating registry data. */
  public checkForUpdate(): Promise<ProviderRegistryUpdateCheck> {
    if (this.applyInFlight) {
      return this.applyInFlight.then(() => this.getCurrentUpdateStatus());
    }
    if (this.checkInFlight) {
      return this.checkInFlight.then(() => this.getAvailableUpdateStatus());
    }

    this.checkInFlight = this.findAvailableUpdate().finally(() => {
      this.checkInFlight = undefined;
    });
    return this.checkInFlight.then(() => this.getAvailableUpdateStatus());
  }

  /** Download and activate the available registry snapshot after user confirmation. */
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
    await Promise.allSettled([this.applyInFlight, this.checkInFlight]);
    this.activeManifest = undefined;
    this.availableUpdateSource = undefined;
    providerRegistryService.clearRemoteSnapshot();
    providerRegistryUpdates.clear();
  }

  private async activateCachedSnapshot(): Promise<void> {
    try {
      const snapshot = await readProviderRegistrySnapshot(
        providerRegistryService.getBundledCatalogVersions(),
      );
      if (!snapshot) {
        return;
      }

      this.assertCompatibleManifest(snapshot.manifest);
      const parsed = this.parseAndValidateFiles(snapshot.files, snapshot.manifest);
      providerRegistryService.installRemoteSnapshot(parsed);
      this.activeManifest = snapshot.manifest;
      providerRegistryUpdates.emit({ revision: snapshot.manifest.revision, source: 'cache' });
    } catch (error) {
      providerRegistryService.clearRemoteSnapshot();
      try {
        invalidateProviderRegistrySnapshot();
      } catch (invalidationError) {
        logger.warn(
          'Failed to invalidate an unusable registry snapshot',
          invalidationError as Error,
        );
      }
      logger.warn(
        'Cached registry snapshot is unusable; falling back to bundled data',
        error as Error,
      );
    }
  }

  private async findAvailableUpdate(): Promise<void> {
    let reachedSource = false;
    let lastError: Error | undefined;

    for (const source of this.getSourceOrder()) {
      if (this.stopped) {
        return;
      }

      try {
        const manifest = await this.fetchManifest(source);
        reachedSource = true;
        if (this.isUpdateAvailable(manifest)) {
          this.availableUpdateSource = source;
          return;
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

    this.availableUpdateSource = undefined;
    if (!reachedSource && !this.stopped) {
      throw lastError ?? new Error('No provider registry source is available');
    }
  }

  private async runApplyUpdate(): Promise<ProviderRegistryUpdateResult> {
    if (this.checkInFlight) {
      await this.checkInFlight;
    }
    if (!this.availableUpdateSource) {
      await this.findAvailableUpdate();
    }
    if (!this.availableUpdateSource) {
      return this.getCurrentUpdateStatus();
    }

    const preferredSource = this.availableUpdateSource;
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
        this.availableUpdateSource = undefined;
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
    this.availableUpdateSource = undefined;
    return this.getCurrentUpdateStatus();
  }

  private async applySnapshot(
    staged: StagedSnapshot,
    source: RegistryNetworkSource,
  ): Promise<void> {
    if (Platform.OS !== 'web') {
      await writeProviderRegistrySnapshot(
        staged.files,
        staged.manifest,
        providerRegistryService.getBundledCatalogVersions(),
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
    if (!this.isUpdateAvailable(manifest)) {
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

  private async fetchManifest(source: RegistryNetworkSource): Promise<CatalogManifest> {
    const manifestBody = await this.fetchText(source, 'manifest.json', MAX_MANIFEST_BYTES);
    const manifest = CatalogManifestSchema.parse(JSON.parse(manifestBody));
    this.assertCompatibleManifest(manifest);
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

  private getAvailableUpdateStatus(): ProviderRegistryUpdateCheck {
    return this.availableUpdateSource ? { status: 'available' } : this.getCurrentUpdateStatus();
  }

  private getCurrentUpdateStatus(): { status: 'current' } {
    return { status: 'current' };
  }

  private assertCompatibleManifest(manifest: CatalogManifest): void {
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

    // Desktop and mobile have independent application-version lines. Mobile
    // therefore gates semantic compatibility by its bundled schemas below,
    // rather than comparing its 1.x app version to desktop's 2.x manifest.
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
