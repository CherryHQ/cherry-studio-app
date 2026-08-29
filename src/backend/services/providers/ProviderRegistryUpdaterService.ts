import {
  type CatalogManifest,
  CatalogManifestSchema,
  REGISTRY_SCHEMA_VERSION,
  REMOTE_REGISTRY_FILES,
  type RemoteRegistryFileName,
} from '@cherrystudio/provider-registry/mobile';
import { loggerService } from '@logger';
import { getCalendars, getLocales } from 'expo-localization';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';

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

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FAILED_CHECK_RETRY_MS = 5 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_REGISTRY_FILE_BYTES = 5 * 1024 * 1024;

type RegistryNetworkSource = Exclude<keyof typeof REGISTRY_SOURCES, 'cache'>;

type StagedSnapshot = {
  files: Record<RemoteRegistryFileName, string>;
  manifest: CatalogManifest;
  parsed: ReturnType<typeof providerRegistryService.parseRemoteSnapshot>;
};

/**
 * Pulls model metadata from the desktop-published registry lane.
 *
 * The payload is unsigned, so `providers.json` deliberately remains bundled:
 * remote data can improve model descriptions and capabilities, but can never
 * redirect credentials or change a provider's API destination.
 */
@Injectable('ProviderRegistryUpdaterService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
export class ProviderRegistryUpdaterService extends BaseService {
  private activeManifest: CatalogManifest | undefined;
  private checkInFlight: Promise<void> | undefined;
  private nextAutomaticCheckAt = 0;
  private readonly requestControllers = new Set<AbortController>();
  private stopped = false;

  protected async onReady(): Promise<void> {
    this.stopped = false;
    if (Platform.OS !== 'web') {
      await this.activateCachedSnapshot();
    }

    this.registerAppStateListener((status) => {
      if (status === 'active') {
        void this.checkIfDue();
      }
    });
    this.registerInterval(() => this.checkIfDue(), CHECK_INTERVAL_MS);

    const initialCheck = setTimeout(() => void this.check(), INITIAL_CHECK_DELAY_MS);
    this.registerDisposable(() => clearTimeout(initialCheck));
  }

  /** Run one serialized update cycle. Network and validation failures never escape. */
  public check(): Promise<void> {
    if (this.checkInFlight) {
      return this.checkInFlight;
    }

    this.checkInFlight = this.runUpdateCycle()
      .catch((error) => {
        this.nextAutomaticCheckAt = Date.now() + FAILED_CHECK_RETRY_MS;
        logger.warn('Registry update cycle failed; keeping current data', error as Error);
      })
      .finally(() => {
        this.checkInFlight = undefined;
      });
    return this.checkInFlight;
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    for (const controller of this.requestControllers) {
      controller.abort();
    }
    await this.checkInFlight;
    providerRegistryService.clearRemoteSnapshot();
    providerRegistryUpdates.clear();
  }

  private checkIfDue(): Promise<void> | void {
    if (Date.now() >= this.nextAutomaticCheckAt) {
      return this.check();
    }
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

  private async runUpdateCycle(): Promise<void> {
    let reachedCurrentSource = false;

    for (const source of this.getSourceOrder()) {
      if (this.stopped) {
        return;
      }

      try {
        const staged = await this.fetchAndValidate(source);
        if (!staged) {
          reachedCurrentSource = true;
          continue;
        }

        await this.applySnapshot(staged, source);
        reachedCurrentSource = true;
      } catch (error) {
        if (!this.stopped) {
          logger.warn('Registry source failed; trying the fallback source', error as Error, {
            source,
          });
        }
      }
    }

    this.nextAutomaticCheckAt =
      Date.now() + (reachedCurrentSource ? CHECK_INTERVAL_MS : FAILED_CHECK_RETRY_MS);
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
    const manifestBody = await this.fetchText(source, 'manifest.json', MAX_MANIFEST_BYTES);
    const manifest = CatalogManifestSchema.parse(JSON.parse(manifestBody));
    this.assertCompatibleManifest(manifest);

    if (this.activeManifest && manifest.revision <= this.activeManifest.revision) {
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
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    this.requestControllers.add(controller);

    try {
      const response = await expoFetch(`${REGISTRY_SOURCES[source]}/${name}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${name} returned HTTP ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Error(`${name} exceeds the ${maxBytes}-byte limit`);
      }

      const body = await response.text();
      if (body.length > maxBytes) {
        throw new Error(`${name} exceeds the ${maxBytes}-byte limit`);
      }
      return body;
    } finally {
      clearTimeout(timeout);
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
