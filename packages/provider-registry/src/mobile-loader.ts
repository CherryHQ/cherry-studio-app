import modelsRegistry from '../data/models.json';
import providerModelsRegistry from '../data/provider-models.json';
import providersRegistry from '../data/providers.json';
import type { ModelConfig } from './schemas/model';
import { ModelListSchema } from './schemas/model';
import type { ProviderConfig } from './schemas/provider';
import { ProviderListSchema } from './schemas/provider';
import type { ProviderModelOverride } from './schemas/provider-models';
import { ProviderModelListSchema } from './schemas/provider-models';
import { normalizeModelId } from './utils/normalize';

type RegistryBundle = {
  models: { version: string; models: ModelConfig[] };
  providerModels: { version: string; overrides: ProviderModelOverride[] };
  providers: { version: string; providers: ProviderConfig[] };
};

type ModelsBundle = RegistryBundle['models'];
type ProviderModelsBundle = RegistryBundle['providerModels'];
type ProvidersBundle = RegistryBundle['providers'];

/**
 * Preset providers whose only authentication path is a provider OAuth login.
 * The app has no OAuth sign-in, so these rows can never be configured and are
 * projected out of every provider read. The bundled catalog stays intact — this
 * is the app-side answer to "can a mobile user actually use this", not a claim
 * about what the desktop catalog contains.
 */
const MOBILE_UNSUPPORTED_PRESET_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'copilot',
  'grok-cli',
  'openai-codex',
]);

let parsedModels: ModelsBundle | null = null;
let parsedProviderModels: ProviderModelsBundle | null = null;
let parsedProviders: ProvidersBundle | null = null;

function loadModelsBundle(): ModelsBundle {
  parsedModels ??= ModelListSchema.parse(modelsRegistry);
  return parsedModels;
}

function loadProviderModelsBundle(): ProviderModelsBundle {
  parsedProviderModels ??= ProviderModelListSchema.parse(providerModelsRegistry);
  return parsedProviderModels;
}

function loadProvidersBundle(): ProvidersBundle {
  parsedProviders ??= ProviderListSchema.parse(providersRegistry);
  return parsedProviders;
}

export class MobileRegistryLoader {
  private modelById: Map<string, ModelConfig> | null = null;
  private modelByNormId: Map<string, ModelConfig> | null = null;
  private overrideByKey: Map<string, ProviderModelOverride> | null = null;
  private overrideByNormKey: Map<string, ProviderModelOverride> | null = null;
  private overrideByApiKey: Map<string, ProviderModelOverride> | null = null;
  private overrideByNormApiKey: Map<string, ProviderModelOverride> | null = null;
  private overridesByProvider: Map<string, ProviderModelOverride[]> | null = null;
  private providerById: Map<string, ProviderConfig> | null = null;

  loadModels(): ModelConfig[] {
    const models = loadModelsBundle().models ?? [];
    this.buildModelIndex(models);
    return models;
  }

  loadProviders(): ProviderConfig[] {
    const providers = loadProvidersBundle().providers ?? [];
    this.buildProviderIndex(providers);
    return providers;
  }

  loadProviderModels(): ProviderModelOverride[] {
    const overrides = loadProviderModelsBundle().overrides ?? [];
    this.buildOverrideIndex(overrides);
    return overrides;
  }

  isProviderExcluded(providerId: string): boolean {
    return MOBILE_UNSUPPORTED_PRESET_PROVIDER_IDS.has(providerId);
  }

  getExcludedProviderIds(): readonly string[] {
    return [...MOBILE_UNSUPPORTED_PRESET_PROVIDER_IDS];
  }

  getModelsVersion(): string {
    return loadModelsBundle().version;
  }

  getProvidersVersion(): string {
    return loadProvidersBundle().version;
  }

  getProviderModelsVersion(): string {
    return loadProviderModelsBundle().version;
  }

  findModel(modelId: string): ModelConfig | null {
    this.loadModels();
    return (
      this.modelById?.get(modelId) ?? this.modelByNormId?.get(normalizeModelId(modelId)) ?? null
    );
  }

  findProvider(providerId: string): ProviderConfig | null {
    this.loadProviders();
    return this.providerById?.get(providerId) ?? null;
  }

  findOverride(providerId: string, modelId: string): ProviderModelOverride | null {
    this.loadProviderModels();
    const key = `${providerId}::${modelId}`;
    const normKey = `${providerId}::${normalizeModelId(modelId)}`;

    return (
      this.overrideByKey?.get(key) ??
      this.overrideByApiKey?.get(key) ??
      this.overrideByNormKey?.get(normKey) ??
      this.overrideByNormApiKey?.get(normKey) ??
      null
    );
  }

  getOverridesForProvider(providerId: string): ProviderModelOverride[] {
    this.loadProviderModels();
    return this.overridesByProvider?.get(providerId) ?? [];
  }

  invalidate(): void {
    this.modelById = null;
    this.modelByNormId = null;
    this.overrideByKey = null;
    this.overrideByNormKey = null;
    this.overrideByApiKey = null;
    this.overrideByNormApiKey = null;
    this.overridesByProvider = null;
    this.providerById = null;
  }

  private buildModelIndex(models: ModelConfig[]): void {
    if (this.modelById && this.modelByNormId) {
      return;
    }

    this.modelById = new Map();
    this.modelByNormId = new Map();

    for (const model of models) {
      this.modelById.set(model.id, model);
      const normalizedId = normalizeModelId(model.id);
      if (!this.modelByNormId.has(normalizedId)) {
        this.modelByNormId.set(normalizedId, model);
      }
    }
  }

  private buildProviderIndex(providers: ProviderConfig[]): void {
    if (this.providerById) {
      return;
    }

    this.providerById = new Map(providers.map((provider) => [provider.id, provider]));
  }

  private buildOverrideIndex(overrides: ProviderModelOverride[]): void {
    if (
      this.overrideByKey &&
      this.overrideByNormKey &&
      this.overrideByApiKey &&
      this.overrideByNormApiKey &&
      this.overridesByProvider
    ) {
      return;
    }

    this.overrideByKey = new Map();
    this.overrideByNormKey = new Map();
    this.overrideByApiKey = new Map();
    this.overrideByNormApiKey = new Map();
    this.overridesByProvider = new Map();

    for (const override of overrides) {
      const key = `${override.providerId}::${override.modelId}`;
      if (!this.overrideByKey.has(key) || override.apiModelId === override.modelId) {
        this.overrideByKey.set(key, override);
      }

      const normalizedKey = `${override.providerId}::${normalizeModelId(override.modelId)}`;
      if (!this.overrideByNormKey.has(normalizedKey)) {
        this.overrideByNormKey.set(normalizedKey, override);
      }

      if (override.apiModelId) {
        const apiKey = `${override.providerId}::${override.apiModelId}`;
        this.overrideByApiKey.set(apiKey, override);

        const normalizedApiKey = `${override.providerId}::${normalizeModelId(override.apiModelId)}`;
        if (!this.overrideByNormApiKey.has(normalizedApiKey)) {
          this.overrideByNormApiKey.set(normalizedApiKey, override);
        }
      }

      const providerOverrides = this.overridesByProvider.get(override.providerId) ?? [];
      providerOverrides.push(override);
      this.overridesByProvider.set(override.providerId, providerOverrides);
    }
  }
}

let sharedLoader: MobileRegistryLoader | null = null;

export function getMobileRegistryLoader(): MobileRegistryLoader {
  sharedLoader ??= new MobileRegistryLoader();
  return sharedLoader;
}
