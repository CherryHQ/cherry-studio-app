import {
  CatalogManifestSchema,
  createRegistry,
  ModelListSchema,
  ProviderModelListSchema,
  type CatalogManifest,
  type ModelConfig,
  type ProviderModelOverride,
  type Registry,
} from '@cherrystudio/provider-registry';

import {
  findMobileProvider,
  mobileProviders,
  type MobileProviderConfig,
} from './mobileProviderCatalog';

export { CatalogManifestSchema };
export type { CatalogManifest };
export type ModelsBundle = ReturnType<typeof ModelListSchema.parse>;
export type ProviderModelsBundle = ReturnType<typeof ProviderModelListSchema.parse>;

/** Schema lane shared with the desktop-published remote registry. */
export const REGISTRY_SCHEMA_VERSION = 3;

/**
 * Desktop registry semantic baseline supported by Mobile's consumed fields.
 *
 * This is deliberately not the Mobile application version. The remote manifest
 * is published by Desktop, so its minimum reader version is compared with the
 * Desktop registry behavior implemented here. Older cached schemas remain
 * readable while the updater migrates them to the current download lane.
 */
export const REGISTRY_DESKTOP_COMPATIBILITY_VERSION = '2.1.4';

/** Unsigned remote data may describe models, never provider routing or credentials. */
export const REMOTE_REGISTRY_FILES = ['models.json', 'provider-models.json'] as const;
export type RemoteRegistryFileName = (typeof REMOTE_REGISTRY_FILES)[number];

type VersionParts = readonly [major: number, minor: number, patch: number];

function coerceVersionParts(value: string): VersionParts | null {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersionParts(left: VersionParts, right: VersionParts): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

/** Whether this Mobile runtime implements the semantics required by a remote snapshot. */
export function isCatalogManifestCompatible(
  manifest: CatalogManifest,
  runtimeVersion = REGISTRY_DESKTOP_COMPATIBILITY_VERSION,
): boolean {
  if (manifest.schemaVersion < 1 || manifest.schemaVersion > REGISTRY_SCHEMA_VERSION) {
    return false;
  }

  const runtime = coerceVersionParts(runtimeVersion);
  const minimum = coerceVersionParts(manifest.minAppVersion);
  const source = coerceVersionParts(manifest.sourceAppVersion);
  if (!runtime || !minimum || !source) {
    return false;
  }

  // New runtimes still read older snapshots from the same schema lane.
  return compareVersionParts(runtime, minimum) >= 0 && compareVersionParts(minimum, source) <= 0;
}

export type MobileRemoteRegistrySnapshot = {
  models: ModelsBundle;
  providerModels: ProviderModelsBundle;
};

/**
 * OAuth-only presets excluded from runtime reads, including saved providers.
 * These flows still require an external CLI. Keep temporary setup or product limitations
 * in the catalog-only exclusions below so existing
 * records remain readable. Provider definitions remain bundled in both cases.
 */
const MOBILE_RUNTIME_EXCLUDED_PRESET_PROVIDER_IDS: ReadonlySet<string> = new Set(['grok-cli']);

/** Presets hidden from new-provider setup while Mobile lacks the required support. */
const MOBILE_CATALOG_EXCLUDED_PRESET_PROVIDER_IDS: ReadonlySet<string> = new Set([
  // Subscription credentials are restricted to the official Muse Code client.
  'meta',
  // Local-server presets are hidden from Mobile setup.
  'lmstudio',
  'ollama',
  'ovms',
  'new-api',
  // Requires the external Claude Code CLI runtime.
  'claude-code',
  // Require credential fields and adapters that Mobile does not support yet.
  'azure-openai',
  'vertexai',
  'aws-bedrock',
  // Embedding/rerank catalogs have no consuming Mobile feature yet.
  'jina',
  'voyageai',
]);

export class MobileRegistryLoader {
  private remoteSnapshot: MobileRemoteRegistrySnapshot | null = null;
  private registry: Registry | null = null;

  private getRegistry(): Registry {
    this.registry ??= createRegistry({ ...this.requireSnapshot(), providers: mobileProviders });
    return this.registry;
  }

  loadModels(): ModelConfig[] {
    return this.requireSnapshot().models.models;
  }
  loadProviders(): MobileProviderConfig[] {
    return mobileProviders.providers;
  }
  loadProviderModels(): ProviderModelOverride[] {
    return this.requireSnapshot().providerModels.overrides;
  }
  isProviderExcluded(providerId: string): boolean {
    return MOBILE_RUNTIME_EXCLUDED_PRESET_PROVIDER_IDS.has(providerId);
  }

  getExcludedProviderIds(): readonly string[] {
    return [...MOBILE_RUNTIME_EXCLUDED_PRESET_PROVIDER_IDS];
  }

  /** Controls catalog listing and preset import, not reads of saved providers. */
  isProviderExcludedFromCatalog(providerId: string): boolean {
    return (
      this.isProviderExcluded(providerId) ||
      MOBILE_CATALOG_EXCLUDED_PRESET_PROVIDER_IDS.has(providerId)
    );
  }

  getModelsVersion(): string | undefined {
    return this.remoteSnapshot?.models.version;
  }

  getProvidersVersion(): string {
    return mobileProviders.version;
  }

  getProviderModelsVersion(): string | undefined {
    return this.remoteSnapshot?.providerModels.version;
  }

  isReady(): boolean {
    return this.remoteSnapshot !== null;
  }

  assertReady(): void {
    this.requireSnapshot();
  }

  private requireSnapshot(): MobileRemoteRegistrySnapshot {
    if (!this.remoteSnapshot) {
      throw new Error('Model registry has not been downloaded yet');
    }
    return this.remoteSnapshot;
  }

  parseRemoteSnapshot(input: {
    models: unknown;
    providerModels: unknown;
  }): MobileRemoteRegistrySnapshot {
    const models = ModelListSchema.parse(input.models);
    const providerModels = ProviderModelListSchema.parse(input.providerModels);
    // The pinned native runtime cannot serialize Anthropic between_tools yet.
    return {
      models: {
        ...models,
        models: models.models.filter(
          (model) => model.reasoning?.wireDialect !== 'adaptive-between-tools',
        ),
      },
      providerModels: {
        ...providerModels,
        overrides: providerModels.overrides.filter(
          (override) =>
            !Object.values(override.reasoningContracts ?? {}).some(
              (contract) => contract.support?.wireDialect === 'adaptive-between-tools',
            ),
        ),
      },
    };
  }

  installRemoteSnapshot(snapshot: MobileRemoteRegistrySnapshot): void {
    this.remoteSnapshot = snapshot;
    this.registry = null;
  }

  clearRemoteSnapshot(): void {
    this.remoteSnapshot = null;
    this.registry = null;
  }

  invalidate(): void {
    this.registry = null;
  }

  findModel(modelId: string): ModelConfig | null {
    return this.getRegistry().findModel(modelId);
  }
  findProvider(providerId: string): MobileProviderConfig | null {
    return findMobileProvider(providerId);
  }
  findOverride(providerId: string, modelId: string): ProviderModelOverride | null {
    return this.getRegistry().findOverride(providerId, modelId);
  }
  getOverridesForProvider(providerId: string): readonly ProviderModelOverride[] {
    return this.getRegistry().getOverridesForProvider(providerId);
  }
}
let sharedLoader: MobileRegistryLoader | null = null;

export function getMobileRegistryLoader(): MobileRegistryLoader {
  sharedLoader ??= new MobileRegistryLoader();
  return sharedLoader;
}
