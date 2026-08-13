import {
  type ConfigureBuiltinProviderInput,
  type CreateCustomProviderInput,
  type ListProvidersInput,
  type ProviderConfigurationResolution,
  type ProviderConfigurationSummary,
  type ProviderListItem,
  type ProviderListOutput,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/types';
import { CHERRYAI_PROVIDER_ID } from '@cherrystudio/universal/data/presets/cherryai';
import { type Model, type UniqueModelId } from '@cherrystudio/universal/data/types/model';
import {
  type AuthConfig,
  canEditProviderEndpoint,
  type Provider,
} from '@cherrystudio/universal/data/types/provider';

import { application } from '@/backend/core/application/Application';
import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { Database } from '@/backend/data/db/DbService';
import type { CreateModelInput } from '@/backend/data/services/ModelService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { buildModelPullPreview } from '@/backend/services/models/buildModelPullPreview';
import { modelToAddInput } from '@/backend/services/models/createModelsModule';
import type {
  ProviderSetupMatchedProvider,
  ProviderSetupModule,
  ProviderSetupPreview,
  ProviderSetupResolveResult,
} from '@/shared/contracts';

import {
  appendProviderApiKey,
  assertCustomProviderNameAvailable,
  dedupeProviderSetupModels,
  getProviderOrigin,
  materializeManualModels,
  normalizeProviderLookup,
  normalizeProviderName,
  prepareBuiltinProviderSetup,
  prepareCustomProviderSetup,
  type PreparedProviderSetup,
  type ProviderSetupDraft,
} from './providerSetupDraft';

type ExecutionCatalog = {
  models: Model[];
  source: 'api' | 'registry' | 'skipped';
};

@Injectable('ProviderSetupService')
@ServicePhase(Phase.PostReady)
export class ProviderSetupService extends BaseService implements ProviderSetupModule {
  async resolveBuiltin(query: string): Promise<ProviderSetupResolveResult> {
    const normalized = normalizeProviderLookup(query);
    if (!normalized) {
      return resolution('provider-required', 'Ask the user which built-in provider to configure.');
    }

    const providers = (await providerService.list()).filter(
      (provider) => provider.presetProviderId != null && provider.id !== CHERRYAI_PROVIDER_ID,
    );
    const matches = providers.filter((provider) =>
      [provider.id, provider.name].some(
        (candidate) => normalizeProviderLookup(candidate) === normalized,
      ),
    );

    if (matches.length === 0) {
      return resolution(
        'not-found',
        `No built-in provider exactly matches "${query.trim()}". Ask the user to choose another provider or create a custom provider.`,
      );
    }
    if (matches.length > 1) {
      return resolution(
        'ambiguous',
        'More than one built-in provider matches. Ask the user to choose one candidate.',
        matches,
      );
    }

    return this.snapshot(matches[0]);
  }

  async previewBuiltin(
    input: ConfigureBuiltinProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderSetupPreview> {
    const resolved = await this.resolveBuiltin(input.provider);
    if (resolved.status !== 'matched') throw new Error(resolved.message);
    const prepared = prepareBuiltinProviderSetup(resolved.provider, input);
    return this.preview(prepared, input, signal);
  }

  async previewCustom(
    input: CreateCustomProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderSetupPreview> {
    const prepared = await this.prepareCustom(input);
    return this.preview(prepared, input, signal);
  }

  async executeBuiltin(
    input: ConfigureBuiltinProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderConfigurationSummary | ProviderConfigurationResolution> {
    if (!(await this.isEnabled())) return disabledResolution();
    const resolved = await this.resolveBuiltin(input.provider);
    if (resolved.status !== 'matched') return resolved;

    let prepared: PreparedProviderSetup;
    try {
      prepared = prepareBuiltinProviderSetup(resolved.provider, input);
    } catch (error) {
      return invalidResolution(error);
    }
    const catalog = await this.catalogForExecution(prepared, input, signal);
    return this.commitBuiltin(prepared, input, catalog);
  }

  async executeCustom(
    input: CreateCustomProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderConfigurationSummary | ProviderConfigurationResolution> {
    if (!(await this.isEnabled())) return disabledResolution();

    let prepared: PreparedProviderSetup;
    try {
      prepared = await this.prepareCustom(input);
    } catch (error) {
      return invalidResolution(error);
    }
    const catalog = await this.catalogForExecution(prepared, input, signal);
    try {
      return await this.commitCustom(prepared, input, catalog);
    } catch (error) {
      return invalidResolution(error);
    }
  }

  async listProviders(input: ListProvidersInput): Promise<ProviderListOutput> {
    if (!(await this.isEnabled())) return { providers: [], status: 'disabled' };

    const [providers, models] = await Promise.all([providerService.list(), modelService.list()]);
    const modelCounts = new Map<string, number>();
    for (const model of models) {
      modelCounts.set(model.providerId, (modelCounts.get(model.providerId) ?? 0) + 1);
    }

    const items = await Promise.all(
      providers
        .filter((provider) => provider.id !== CHERRYAI_PROVIDER_ID)
        .map(async (provider): Promise<ProviderListItem> => {
          const modelCount = modelCounts.get(provider.id) ?? 0;
          const authenticationStatus = await getProviderAuthenticationStatus(provider);
          const kind = provider.presetProviderId == null ? 'custom' : 'builtin';
          return {
            authenticationStatus,
            id: provider.id,
            isConfigured:
              kind === 'custom' ||
              provider.isEnabled ||
              authenticationStatus === 'ready' ||
              modelCount > 0,
            isEnabled: provider.isEnabled,
            kind,
            modelCount,
            name: provider.name,
          };
        }),
    );

    return {
      providers: items.filter((item) => matchesListFilter(item, input.filter)),
      status: 'ok',
    };
  }

  private async isEnabled(): Promise<boolean> {
    return application.get('PreferenceService').get('chat.tools.provider_configuration.enabled');
  }

  private async snapshot(provider: Provider): Promise<ProviderSetupMatchedProvider> {
    const row = await providerService.getRowByProviderId(provider.id);
    return {
      apiKeyCount: row?.apiKeys?.length ?? 0,
      canEditEndpoint: canEditProviderEndpoint(provider),
      origin: getProviderOrigin(provider),
      provider,
      status: 'matched',
    };
  }

  private async preview(
    prepared: PreparedProviderSetup,
    input: ProviderSetupDraft,
    signal?: AbortSignal,
  ): Promise<ProviderSetupPreview> {
    const [localModels, snapshot] = await Promise.all([
      modelService.list({ providerId: prepared.provider.id }),
      this.snapshot(prepared.provider),
    ]);
    const catalog = input.skipModelPull
      ? { models: [], remotelyProbed: false, source: 'skipped' as const }
      : await application
          .get('ModelCatalogService')
          .list({
            ...(prepared.authConfig
              ? { apiKey: prepared.apiKey, authConfig: prepared.authConfig }
              : {}),
            ...(!prepared.authConfig && prepared.apiKey ? { apiKey: prepared.apiKey } : {}),
            provider: prepared.provider,
            signal,
          })
          .catch((error: unknown) => {
            if (signal?.aborted) throw signal.reason ?? error;
            return {
              error: error instanceof Error ? error.message : String(error),
              models: [],
              remotelyProbed: false,
              source: 'skipped' as const,
            };
          });
    const models =
      catalog.source === 'skipped'
        ? { added: [], missing: [] }
        : buildModelPullPreview(prepared.provider.id, localModels, catalog.models);
    const excludedIds = new Set([
      ...localModels.map((model) => model.id),
      ...materializeManualModels(input.manualModels, prepared.provider.id).map((model) => model.id),
    ]);
    const added = models.added.filter((model) => !excludedIds.has(model.id));

    return {
      ...snapshot,
      apiKeyWillBeAdded: await willAddApiKey(prepared.provider.id, prepared.apiKey),
      ...('error' in catalog ? { catalogError: catalog.error } : {}),
      catalogSource: catalog.source,
      defaultSelectedModelIds: added.map((model) => model.id),
      models: { added, missing: models.missing },
      origin: getProviderOrigin(prepared.provider),
      provider: prepared.provider,
      remotelyProbed: catalog.remotelyProbed,
    };
  }

  private async prepareCustom(input: CreateCustomProviderInput): Promise<PreparedProviderSetup> {
    const providers = await providerService.list();
    const existing = providers.find((provider) => provider.id === input.providerId.trim());
    const prepared = prepareCustomProviderSetup(input, existing);
    assertCustomProviderNameAvailable(providers, prepared.provider.name, prepared.provider.id);
    return prepared;
  }

  private async catalogForExecution(
    prepared: PreparedProviderSetup,
    input: ProviderSetupDraft,
    signal?: AbortSignal,
  ): Promise<ExecutionCatalog> {
    if (input.skipModelPull) return { models: [], source: 'skipped' };

    try {
      const catalog = await application.get('ModelCatalogService').list({
        ...(prepared.authConfig
          ? { apiKey: prepared.apiKey, authConfig: prepared.authConfig }
          : {}),
        ...(!prepared.authConfig && prepared.apiKey ? { apiKey: prepared.apiKey } : {}),
        provider: prepared.provider,
        signal,
      });
      return { models: catalog.models, source: catalog.source };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      return { models: [], source: 'skipped' };
    }
  }

  private async commitBuiltin(
    prepared: PreparedProviderSetup,
    input: ConfigureBuiltinProviderInput,
    catalog: ExecutionCatalog,
  ): Promise<ProviderConfigurationSummary> {
    const dbService = application.get('DbService');
    return dbService.withWriteTx(async (tx) => {
      const row = await providerService.getRowByProviderIdTx(tx, prepared.provider.id);
      if (!row || row.presetProviderId == null) {
        throw DataApiErrorFactory.notFound('Built-in provider', prepared.provider.id);
      }

      const keys = appendProviderApiKey(row.apiKeys ?? [], prepared.apiKey);
      const apiKeyAdded = keys.length > (row.apiKeys?.length ?? 0);
      const updatedProvider = await providerService.updateTx(tx, prepared.provider.id, {
        ...(prepared.endpointConfigs ? { endpointConfigs: prepared.endpointConfigs } : {}),
        isEnabled: true,
      });
      if (apiKeyAdded) {
        await providerService.replaceApiKeysTx(tx, prepared.provider.id, keys);
      }

      return this.reconcileAndSummarize(tx, updatedProvider, input, catalog, apiKeyAdded);
    });
  }

  private async commitCustom(
    prepared: PreparedProviderSetup,
    input: CreateCustomProviderInput,
    catalog: ExecutionCatalog,
  ): Promise<ProviderConfigurationSummary> {
    const dbService = application.get('DbService');
    return dbService.withWriteTx(async (tx) => {
      const rows = await providerService.listRowsTx(tx);
      const existing = rows.find((row) => row.providerId === prepared.provider.id);
      if (existing?.presetProviderId != null) {
        throw new Error('The generated provider id belongs to a built-in provider.');
      }
      if (
        existing &&
        normalizeProviderName(existing.name) !== normalizeProviderName(prepared.provider.name)
      ) {
        throw new Error('The generated provider id is already used by another custom provider.');
      }
      assertCustomProviderNameAvailable(
        rows.map((row) => ({ id: row.providerId, name: row.name })),
        prepared.provider.name,
        prepared.provider.id,
      );

      const previousKeys = existing?.apiKeys ?? [];
      const keys = appendProviderApiKey(previousKeys, prepared.apiKey);
      const apiKeyAdded = keys.length > previousKeys.length;
      let provider = existing
        ? await providerService.updateTx(tx, prepared.provider.id, {
            authConfig: { type: 'api-key' },
            defaultChatEndpoint: prepared.provider.defaultChatEndpoint,
            endpointConfigs: prepared.endpointConfigs,
            isEnabled: true,
            name: prepared.provider.name,
          })
        : await providerService.createTx(tx, {
            apiKeys: keys,
            authConfig: { type: 'api-key' },
            defaultChatEndpoint: prepared.provider.defaultChatEndpoint,
            endpointConfigs: prepared.endpointConfigs,
            name: prepared.provider.name,
            providerId: prepared.provider.id,
          });

      if (existing && apiKeyAdded) {
        provider = await providerService.replaceApiKeysTx(tx, prepared.provider.id, keys);
      }
      if (!provider.isEnabled) {
        provider = await providerService.updateTx(tx, prepared.provider.id, { isEnabled: true });
      }

      return this.reconcileAndSummarize(tx, provider, input, catalog, apiKeyAdded);
    });
  }

  private async reconcileAndSummarize(
    tx: Database,
    provider: Provider,
    input: ProviderSetupDraft,
    catalog: ExecutionCatalog,
    apiKeyAdded: boolean,
  ): Promise<ProviderConfigurationSummary> {
    const localModels = await modelService.listByProviderTx(tx, provider.id);
    const localIds = new Set(localModels.map((model) => model.id));
    const catalogById = new Map(catalog.models.map((model) => [model.id, model]));
    const requestedAddIds = new Set(input.selectedModelIds as UniqueModelId[]);
    const requestedRemoveIds = new Set(input.removedModelIds as UniqueModelId[]);
    const manual = materializeManualModels(input.manualModels, provider.id);
    const requestedAdditions = dedupeProviderSetupModels([
      ...[...requestedAddIds].flatMap((id) => {
        const model = catalogById.get(id);
        return model ? [model] : [];
      }),
      ...manual,
    ]);
    const missingIds = new Set(
      catalog.source === 'skipped'
        ? []
        : buildModelPullPreview(provider.id, localModels, catalog.models).missing.map(
            (model) => model.id,
          ),
    );
    const toRemove = [...requestedRemoveIds].filter((id) => missingIds.has(id));
    const toRemoveSet = new Set(toRemove);
    const toAdd = requestedAdditions.filter(
      (model) => !localIds.has(model.id) || toRemoveSet.has(model.id),
    );

    const result = await modelService.reconcileProviderModelsTx(
      tx,
      provider.id,
      {
        toAdd: toAdd.map((model) => modelToAddInput(model) as CreateModelInput),
        toRemove,
      },
      {
        defaultChatEndpoint: provider.defaultChatEndpoint,
        presetProviderId: provider.presetProviderId,
      },
    );
    const addedIds = new Set(result.added.map((model) => model.id));
    const removedIds = new Set(result.removedIds);
    const requestedAdditionIds = new Set([...requestedAddIds, ...manual.map((model) => model.id)]);
    const modelsSkipped = [
      ...[...requestedAdditionIds].filter((id) => !addedIds.has(id) && !localIds.has(id)),
      ...[...requestedRemoveIds].filter((id) => !removedIds.has(id)),
    ].filter((id, index, values) => values.indexOf(id) === index);

    return {
      apiKeyAdded,
      catalogSource: catalog.source,
      modelsAdded: [...addedIds],
      modelsRemoved: [...removedIds],
      modelsSkipped,
      origin: getProviderOrigin(provider),
      providerId: provider.id,
      providerName: provider.name,
      status: 'configured',
    };
  }
}

function matchesListFilter(item: ProviderListItem, filter: ListProvidersInput['filter']): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'configured':
      return item.isConfigured;
    case 'enabled':
      return item.isEnabled;
    case 'builtin':
      return item.kind === 'builtin';
    case 'custom':
      return item.kind === 'custom';
  }
}

async function getProviderAuthenticationStatus(
  provider: Provider,
): Promise<ProviderListItem['authenticationStatus']> {
  const hasApiKey = provider.apiKeys.some((key) => key.isEnabled);
  if (hasApiKey) return 'ready';

  const [authConfig, oauthStatus] = await Promise.all([
    provider.authType === 'api-key' || provider.authType === 'api-key-aws'
      ? null
      : providerService.getAuthConfig(provider.id),
    getOAuthStatus(provider),
  ]);
  const hasAuthCredential =
    oauthStatus?.isAuthenticated === true ||
    (authConfig ? hasCompleteAuthConfig(authConfig) : false);
  if (hasAuthCredential) return 'ready';
  if (provider.authOptional === true) return 'not-required';
  if (provider.authMethods?.includes('external-cli')) return 'unknown';

  const canUseApiKey = provider.authMethods?.includes('api-key') ?? true;
  if (oauthStatus?.isConfigured === false && !canUseApiKey) return 'unavailable';
  if (provider.authMethods?.includes('oauth') && !oauthStatus && !canUseApiKey) return 'unknown';
  return 'missing';
}

async function getOAuthStatus(provider: Provider) {
  if (!provider.authMethods?.includes('oauth')) return null;
  try {
    return await application.get('ProviderOAuthService').getStatus(provider.id);
  } catch {
    return null;
  }
}

function hasCompleteAuthConfig(authConfig: AuthConfig): boolean {
  switch (authConfig.type) {
    case 'oauth':
      return Boolean(authConfig.accessToken?.trim() || authConfig.refreshToken?.trim());
    case 'iam-aws':
      return Boolean(
        authConfig.region.trim() &&
        authConfig.accessKeyId?.trim() &&
        authConfig.secretAccessKey?.trim(),
      );
    case 'iam-gcp': {
      const credentials = authConfig.credentials;
      return Boolean(
        authConfig.location.trim() &&
        authConfig.project.trim() &&
        credentials &&
        (credentials.clientEmail || credentials.client_email) &&
        (credentials.privateKey || credentials.private_key),
      );
    }
    case 'api-key':
    case 'api-key-aws':
    case 'iam-azure':
      return false;
  }
}

async function willAddApiKey(providerId: string, apiKey: string): Promise<boolean> {
  const trimmed = apiKey.trim();
  if (!trimmed) return false;
  const { keys } = await providerService.listApiKeys(providerId).catch(() => ({ keys: [] }));
  return !keys.some((entry) => entry.key.trim() === trimmed);
}

function resolution(
  status: ProviderConfigurationResolution['status'],
  message: string,
  providers: readonly Pick<Provider, 'id' | 'name'>[] = [],
): ProviderConfigurationResolution {
  return {
    candidates: providers.map(({ id, name }) => ({ id, name })),
    message,
    status,
  };
}

function disabledResolution(): ProviderConfigurationResolution {
  return resolution('disabled', 'Provider configuration tools are disabled in Settings.');
}

function invalidResolution(error: unknown): ProviderConfigurationResolution {
  return resolution('invalid', error instanceof Error ? error.message : String(error));
}
