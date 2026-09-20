import * as Crypto from 'expo-crypto';

import { modelConfigurationChanges } from '@/backend/data/modelConfigurationChanges';
import type {
  TranslationAvailability,
  TranslationModel,
  TranslationSurface,
} from '@/shared/contracts/translation';
import type { PreferenceClient } from '@/shared/data/preference';
import type { Model } from '@/shared/data/types/model';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

import {
  getSystemIntegration,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';
import { getProviderConfigurationIssue } from '../providers/providerConfiguration';
import { isTranslationLanguage, readTranslationSettings } from './translationRequest';

type ConfigurationDependencies = {
  preferences: Pick<PreferenceClient, 'getCachedValue'>;
  getModel(id: string): Promise<Model | null>;
  getProvider(id: string): Promise<Provider>;
  getKeys(id: string): Promise<{ keys: ApiKeyEntry[] }>;
  getAuth(id: string): Promise<AuthConfig | null>;
  getInterfaceLanguage(): string;
  ensureModelCatalog(): Promise<void>;
  resolveNativeConnection(
    provider: Provider,
    model: Model,
    auth: AuthConfig | null,
    settings: ReturnType<typeof readTranslationSettings>,
  ): { endpoint: string; wireModelId: string; requestParameters: Record<string, unknown> } | null;
};

type SelectedConfiguration =
  | {
      status: 'ready';
      model: Model;
      provider: Provider;
      keys: ApiKeyEntry[];
      auth: AuthConfig | null;
      availability: Extract<TranslationAvailability, { status: 'ready' }>;
    }
  | { status: 'unavailable'; availability: TranslationAvailability };

/** Bootstrap owns this projection. Extensions only receive the selected model, never the database. */
export class TranslationConfigurationRuntime {
  private readonly listeners = new Set<() => void>();
  private readonly availabilityListeners = new Set<() => void>();
  private native: SystemIntegrationNativeModule | null = null;
  private stopObserving: (() => void) | undefined;
  private started = false;
  private stopped = false;
  private generation = 0;
  private publishedRevision: string | undefined;
  private pending = Promise.resolve();
  private externalAvailability: TranslationAvailability = {
    status: 'unavailable',
    reason: 'configurationStale',
    targetLanguage: 'en-US',
  };

  constructor(private readonly dependencies: ConfigurationDependencies) {}

  readonly subscribeInvalidation = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly subscribeAvailability = (listener: () => void): (() => void) => {
    this.availabilityListeners.add(listener);
    return () => this.availabilityListeners.delete(listener);
  };

  readonly getAvailability = async (
    surface: TranslationSurface,
  ): Promise<TranslationAvailability> => {
    if (surface === 'app') {
      if (!this.started) void this.start();
      await this.dependencies.ensureModelCatalog();
      return (await this.readSelectedConfiguration()).availability;
    }
    if (!this.started) await this.start();
    await this.pending;
    const capabilities = this.native?.getCapabilities();
    if (
      !capabilities ||
      (surface === 'externalWindow'
        ? !capabilities.translationWindow
        : !capabilities.translationShortcut)
    ) {
      return { ...this.externalAvailability, status: 'unavailable', reason: 'platformUnavailable' };
    }
    if (this.externalAvailability.status === 'ready') {
      const revision = await this.native?.getTranslationRevision().catch(() => null);
      if (!revision || revision !== this.publishedRevision) {
        return {
          ...this.externalAvailability,
          status: 'unavailable',
          reason: 'configurationStale',
        };
      }
    }
    return this.externalAvailability;
  };

  async start(): Promise<void> {
    if (this.started || this.stopped) return this.pending;
    this.started = true;
    this.native = getSystemIntegration();
    this.stopObserving = modelConfigurationChanges.subscribe({
      beforeChange: async () => {
        this.generation += 1;
        this.publishedRevision = undefined;
        this.externalAvailability = {
          ...this.externalAvailability,
          status: 'unavailable',
          reason: 'configurationStale',
        };
        for (const listener of this.listeners) listener();
        this.notify();
        // Drain an already-started native publish before invalidating it. A stale publish must
        // never race past invalidation and restore credentials after the authoritative edit.
        await this.pending;
        await this.native?.invalidateTranslationConfiguration();
      },
      afterChange: () => {
        if (!modelConfigurationChanges.hasPendingWrites()) this.scheduleRefresh();
      },
    });
    this.scheduleRefresh();
    return this.pending;
  }

  async dispose(): Promise<void> {
    this.stopped = true;
    this.generation += 1;
    this.stopObserving?.();
    this.stopObserving = undefined;
    for (const listener of this.listeners) listener();
    this.notify();
    this.listeners.clear();
    this.availabilityListeners.clear();
    await this.pending;
    // The latest configuration deliberately survives app shutdown for native-only invocation.
  }

  private scheduleRefresh(): void {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.pending = this.pending.then(async () => {
      if (
        this.stopped ||
        generation !== this.generation ||
        modelConfigurationChanges.hasPendingWrites()
      )
        return;
      try {
        await this.refresh(generation);
      } catch {
        // Never log configuration objects or credential-storage errors.
        if (generation === this.generation) {
          this.externalAvailability = {
            ...this.externalAvailability,
            status: 'unavailable',
            reason: 'configurationStale',
          };
          this.notify();
        }
      }
    });
  }

  private async refresh(generation: number): Promise<void> {
    const native = this.native;
    if (!native) {
      this.externalAvailability = {
        ...(await this.readSelectedConfiguration()).availability,
        status: 'unavailable',
        reason: 'platformUnavailable',
      };
      this.notify();
      return;
    }
    await native.invalidateTranslationConfiguration();
    const selected = await this.readSelectedConfiguration();
    if (
      this.stopped ||
      generation !== this.generation ||
      modelConfigurationChanges.hasPendingWrites()
    )
      return;
    if (selected.status !== 'ready') {
      await this.publishUnavailable(selected.availability);
      if (generation !== this.generation) return;
      this.externalAvailability = selected.availability;
      this.notify();
      return;
    }
    const settings = readTranslationSettings(this.dependencies.preferences);
    const connection = this.dependencies.resolveNativeConnection(
      selected.provider,
      selected.model,
      selected.auth,
      settings,
    );
    const key = selected.keys.find((entry) => entry.isEnabled && entry.key.trim())?.key;
    if (!connection || !key) {
      const availability: TranslationAvailability = {
        ...selected.availability,
        status: 'unavailable',
        reason: connection ? 'credentialsUnavailable' : 'unsupportedProvider',
      };
      await this.publishUnavailable(availability);
      if (generation !== this.generation) return;
      this.externalAvailability = availability;
      this.notify();
      return;
    }
    const revision = Crypto.randomUUID();
    await native.publishTranslationConfiguration(
      {
        version: 2,
        revision,
        modelId: selected.model.id,
        modelName: selected.model.name,
        providerName: selected.provider.name,
        ...connection,
        targetLanguage: selected.availability.targetLanguage,
        interfaceLanguage: this.dependencies.getInterfaceLanguage(),
        promptTemplate: settings.promptTemplate,
      },
      key,
    );
    if (
      this.stopped ||
      generation !== this.generation ||
      modelConfigurationChanges.hasPendingWrites()
    )
      return;
    this.publishedRevision = revision;
    this.externalAvailability = selected.availability;
    this.notify();
  }

  private async publishUnavailable(availability: TranslationAvailability): Promise<void> {
    if (availability.status !== 'unavailable') return;
    await this.native?.publishTranslationUnavailable({
      version: 1,
      reason: availability.reason,
      modelName: availability.model?.name,
      providerName: availability.model?.providerName,
      targetLanguage: availability.targetLanguage,
      interfaceLanguage: this.dependencies.getInterfaceLanguage(),
    });
  }

  private async readSelectedConfiguration(): Promise<SelectedConfiguration> {
    const { dependencies } = this;
    const preferredLanguage = dependencies.preferences.getCachedValue(
      'feature.translate.target_language',
    );
    const targetLanguage =
      preferredLanguage && isTranslationLanguage(preferredLanguage)
        ? preferredLanguage
        : dependencies.getInterfaceLanguage();
    const selectedId = dependencies.preferences.getCachedValue('feature.translate.model_id');
    const unavailable = (
      reason: Extract<TranslationAvailability, { status: 'unavailable' }>['reason'],
      model?: TranslationModel,
    ): SelectedConfiguration => ({
      status: 'unavailable',
      availability: { status: 'unavailable', reason, model, targetLanguage },
    });
    if (!selectedId) return unavailable('modelNotConfigured');
    if (this.stopped || modelConfigurationChanges.hasPendingWrites())
      return unavailable('configurationStale');
    try {
      const model = await dependencies.getModel(selectedId);
      if (!model || !model.isEnabled || !isTextGenerationModel(model))
        return unavailable('modelUnavailable');
      const provider = await dependencies.getProvider(model.providerId);
      const identity = { id: model.id, name: model.name, providerName: provider.name };
      if (!provider.isEnabled) return unavailable('providerUnavailable', identity);
      const [{ keys }, auth] = await Promise.all([
        dependencies.getKeys(provider.id),
        dependencies.getAuth(provider.id),
      ]);
      const issue = getProviderConfigurationIssue(provider, keys, auth);
      if (issue)
        return unavailable(
          issue === 'invalid-endpoint' ? 'providerUnavailable' : 'credentialsUnavailable',
          identity,
        );
      return {
        status: 'ready',
        model,
        provider,
        keys,
        auth,
        availability: { status: 'ready', model: identity, targetLanguage },
      };
    } catch {
      return unavailable('modelUnavailable');
    }
  }

  private notify(): void {
    for (const listener of this.availabilityListeners) listener();
  }
}
