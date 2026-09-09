import { inferAdapterFamily } from '@cherrystudio/provider-registry';
import { asc, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { DbService } from '@/backend/data/db/DbService';
import {
  desktopConnectionTable,
  type DesktopConnectionRow,
  type InsertUserProviderRow,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { DataApiError, DataApiErrorFactory, ErrorCode } from '@/shared/data/api/errors';
import {
  type DesktopImportPreview,
  type DesktopImportResult,
  type DesktopImportSelectionsDto,
  type DesktopImportUnavailableReason,
  DesktopImportSelectionsSchema,
  type DesktopProviderModel,
  type DesktopProviderSnapshot,
  type DesktopProvidersSnapshot,
  parseSupportedAuthConfig,
} from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';
import { createUniqueModelId, ENDPOINT_TYPE, type EndpointType } from '@/shared/data/types/model';
import type { EndpointConfig, EndpointConfigs } from '@/shared/data/types/provider';

import { buildModelInsertValues, type CreateModelInput } from './ModelService';
import {
  assertCustomProviderEndpointConfiguration,
  assertCustomProviderModelEndpointTypes,
} from './providerModelEndpointIntegrity';
import { providerRegistryService } from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

function desktopError(reason: string, message: string): DataApiError {
  return new DataApiError(ErrorCode.INVALID_OPERATION, message, { reason });
}

function rowToConnection(row: DesktopConnectionRow): DesktopConnection {
  return {
    activeBaseUrl: row.activeBaseUrl,
    desktopVersion: row.desktopVersion,
    id: row.id,
    lastFetchedAt: row.lastFetchedAt,
    name: row.name,
    status: row.status,
  };
}

function endpointFromProviderType(type: string | undefined): EndpointType {
  switch (type) {
    case 'anthropic':
      return ENDPOINT_TYPE.ANTHROPIC_MESSAGES;
    case 'gemini':
    case 'vertexai':
      return ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT;
    case 'ollama':
      return ENDPOINT_TYPE.OLLAMA_CHAT;
    case 'openai-response':
      return ENDPOINT_TYPE.OPENAI_RESPONSES;
    default:
      return ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
  }
}

function mapEndpointConfigs(provider: DesktopProviderSnapshot): EndpointConfigs | null {
  const sourceConfigs = provider.endpointConfigs;
  if (sourceConfigs && Object.keys(sourceConfigs).length > 0) {
    const mapped: EndpointConfigs = {};
    for (const [key, config] of Object.entries(sourceConfigs)) {
      const endpointType = key as EndpointType;
      mapped[endpointType] = {
        ...config,
        adapterFamily: config.adapterFamily ?? inferAdapterFamily(endpointType, config),
      };
    }
    return mapped;
  }

  if (!provider.apiHost) {
    return null;
  }
  const endpointType = provider.defaultChatEndpoint ?? endpointFromProviderType(provider.type);
  const config: EndpointConfig = { baseUrl: provider.apiHost };
  return {
    [endpointType]: {
      ...config,
      adapterFamily: inferAdapterFamily(endpointType, config),
    },
  };
}

function mapApiFeatures(provider: DesktopProviderSnapshot): InsertUserProviderRow['apiFeatures'] {
  const apiFeatures = {
    ...provider.apiFeatures,
    ...(provider.reportsActualCost !== undefined
      ? { reportsActualCost: provider.reportsActualCost }
      : {}),
  };
  return Object.keys(apiFeatures).length > 0 ? apiFeatures : null;
}

function resolvePresetProviderId(provider: DesktopProviderSnapshot): string | null {
  for (const providerId of [provider.presetProviderId, provider.id]) {
    if (
      providerId &&
      providerRegistryService.isRegistryProvider(providerId) &&
      !providerRegistryService.isProviderExcluded(providerId)
    ) {
      return providerId;
    }
  }
  return null;
}

function getProviderImportUnavailableReason(
  provider: DesktopProviderSnapshot,
): DesktopImportUnavailableReason | undefined {
  const hasSupportedAuthMethod = provider.authMethods?.includes('api-key') ?? false;
  return provider.authType === 'oauth' || (provider.authMethods && !hasSupportedAuthMethod)
    ? 'unsupported-auth'
    : undefined;
}

function mapProvider(provider: DesktopProviderSnapshot): Omit<InsertUserProviderRow, 'orderKey'> {
  const seenKeyIds = new Set<string>();
  const seenKeyValues = new Set<string>();
  for (const apiKey of provider.apiKeys) {
    if (seenKeyIds.has(apiKey.id) || seenKeyValues.has(apiKey.key)) {
      throw desktopError('invalid-snapshot', 'Desktop returned duplicate API keys');
    }
    seenKeyIds.add(apiKey.id);
    seenKeyValues.add(apiKey.key);
  }

  const presetProviderId = resolvePresetProviderId(provider);
  const defaultChatEndpoint =
    provider.defaultChatEndpoint ??
    (provider.apiHost ? endpointFromProviderType(provider.type) : null);
  return {
    apiFeatures: mapApiFeatures(provider),
    apiKeys: provider.apiKeys,
    authConfig: parseSupportedAuthConfig(provider.authConfig),
    defaultChatEndpoint,
    endpointConfigs: mapEndpointConfigs(provider),
    isEnabled: true,
    name: provider.name,
    presetProviderId,
    providerId: provider.id,
    providerSettings: provider.providerSettings ?? provider.settings ?? null,
  };
}

function mapModel(
  provider: DesktopProviderSnapshot,
  model: DesktopProviderModel,
  configuration: Pick<InsertUserProviderRow, 'defaultChatEndpoint' | 'presetProviderId'>,
) {
  const registryProviderId = configuration.presetProviderId ?? provider.id;
  const registryContext = {
    defaultChatEndpoint: configuration.defaultChatEndpoint ?? undefined,
    presetProviderId: configuration.presetProviderId ?? null,
  };
  let registryData = providerRegistryService.lookupModel(
    registryProviderId,
    model.modelId,
    registryContext,
  );
  if (!registryData.presetModel && model.presetModelId) {
    registryData = providerRegistryService.lookupModel(
      registryProviderId,
      model.presetModelId,
      registryContext,
    );
  }

  const input: CreateModelInput = {
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    description: model.description,
    endpointTypes: model.endpointTypes,
    group: model.group,
    inputModalities: model.inputModalities,
    isDeprecated: model.isDeprecated ?? false,
    isEnabled: true,
    isHidden: model.isHidden ?? false,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    modelId: model.modelId,
    name: model.name,
    outputModalities: model.outputModalities,
    parameters: model.parameters,
    pricing: model.pricing,
    providerId: provider.id,
    reasoning: model.reasoning,
    registryData,
    supportsStreaming: model.supportsStreaming,
  };
  return { ...buildModelInsertValues(input), reasoning: model.reasoning ?? null };
}

export class DesktopConnectionService {
  // Workflows bind the originating host's database; API reads use the active host.
  constructor(private readonly database?: Pick<DbService, 'getDb' | 'withWriteTx'>) {}

  private get dbService() {
    return this.database ?? application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async list(): Promise<{ items: DesktopConnection[]; total: number }> {
    const rows = await this.db
      .select()
      .from(desktopConnectionTable)
      .orderBy(asc(desktopConnectionTable.createdAt));
    return { items: rows.map(rowToConnection), total: rows.length };
  }

  async getById(id: string): Promise<DesktopConnection> {
    return rowToConnection(await this.getRow(id));
  }

  async getRow(id: string): Promise<DesktopConnectionRow> {
    const [row] = await this.db
      .select()
      .from(desktopConnectionTable)
      .where(eq(desktopConnectionTable.id, id))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('DesktopConnection', id);
    return row;
  }

  async savePair(
    input: Pick<
      DesktopConnectionRow,
      'id' | 'activeBaseUrl' | 'baseUrls' | 'desktopVersion' | 'name'
    >,
    replace: boolean,
    signal: AbortSignal,
  ): Promise<DesktopConnection> {
    return this.dbService.withWriteTx(async (tx) => {
      signal.throwIfAborted();
      const values = { ...input, status: 'paired' as const };
      const [row] = await (replace
        ? tx
            .update(desktopConnectionTable)
            .set(values)
            .where(eq(desktopConnectionTable.id, input.id))
            .returning()
        : tx.insert(desktopConnectionTable).values(values).returning());
      if (!row) throw DataApiErrorFactory.notFound('DesktopConnection', input.id);
      signal.throwIfAborted();
      return rowToConnection(row);
    });
  }

  async remove(id: string): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      tx.delete(desktopConnectionTable).where(eq(desktopConnectionTable.id, id)),
    );
  }

  async updateStatus(
    id: string,
    values: Pick<DesktopConnectionRow, 'status'> &
      Partial<Pick<DesktopConnectionRow, 'activeBaseUrl' | 'lastFetchedAt'>>,
    signal: AbortSignal,
  ): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      signal.throwIfAborted();
      const [row] = await tx
        .update(desktopConnectionTable)
        .set(values)
        .where(eq(desktopConnectionTable.id, id))
        .returning({ id: desktopConnectionTable.id });
      if (!row) throw DataApiErrorFactory.notFound('DesktopConnection', id);
      signal.throwIfAborted();
    });
  }

  async preview(snapshot: DesktopProvidersSnapshot): Promise<DesktopImportPreview> {
    const [providerRows, modelRows] = await Promise.all([
      this.db.select({ id: userProviderTable.providerId }).from(userProviderTable),
      this.db.select({ id: userModelTable.id }).from(userModelTable),
    ]);
    const existingProviders = new Set(providerRows.map((row) => row.id));
    const existingModels = new Set(modelRows.map((row) => row.id));
    return {
      providers: snapshot.providers.map((provider) => {
        const unavailableReason = getProviderImportUnavailableReason(provider);
        return {
          action: existingProviders.has(provider.id) ? 'skip' : 'add',
          id: provider.id,
          models: provider.models.map((model) => ({
            action: existingModels.has(createUniqueModelId(provider.id, model.modelId))
              ? 'skip'
              : 'add',
            modelId: model.modelId,
            name: model.name ?? model.modelId,
          })),
          name: provider.name,
          ...(unavailableReason ? { unavailableReason } : {}),
        };
      }),
    };
  }

  async import(
    id: string,
    snapshot: DesktopProvidersSnapshot,
    input: DesktopImportSelectionsDto,
    signal: AbortSignal,
  ): Promise<DesktopImportResult> {
    const { selections } = DesktopImportSelectionsSchema.parse(input);
    const selectedModes = new Map(selections.map((item) => [item.providerId, item.mode]));
    if (selectedModes.size !== selections.length) {
      throw desktopError('invalid-selection', 'A provider can only be selected once');
    }
    const providersById = new Map(snapshot.providers.map((provider) => [provider.id, provider]));
    for (const providerId of selectedModes.keys()) {
      const provider = providersById.get(providerId);
      if (!provider) {
        throw desktopError('invalid-selection', 'A selected provider is no longer available');
      }
      if (getProviderImportUnavailableReason(provider)) {
        throw desktopError(
          'unsupported-auth',
          'A selected provider uses an authentication method unsupported on mobile',
        );
      }
    }

    return this.dbService.withWriteTx(async (tx) => {
      signal.throwIfAborted();
      const result: DesktopImportResult = {
        modelsAdded: 0,
        modelsSkipped: 0,
        providersAdded: 0,
        providersSkipped: 0,
      };
      for (const [providerId, mode] of selectedModes) {
        signal.throwIfAborted();
        const provider = providersById.get(providerId)!;
        const [existingProvider] = await tx
          .select()
          .from(userProviderTable)
          .where(eq(userProviderTable.providerId, providerId))
          .limit(1);
        // Never map or write the incoming configuration of an existing provider.
        const configuration = existingProvider ?? mapProvider(provider);
        if (existingProvider) {
          result.providersSkipped += 1;
        } else {
          if (!configuration.presetProviderId) {
            assertCustomProviderEndpointConfiguration(configuration);
          }
          await insertWithOrderKey(tx, userProviderTable, configuration, {
            pkColumn: userProviderTable.providerId,
          });
          result.providersAdded += 1;
        }
        if (mode !== 'provider-models') continue;

        const existingModelIds = new Set(
          (
            await tx
              .select({ id: userModelTable.id })
              .from(userModelTable)
              .where(eq(userModelTable.providerId, providerId))
          ).map((row) => row.id),
        );
        const missingModels = provider.models.filter(
          (model) => !existingModelIds.has(createUniqueModelId(providerId, model.modelId)),
        );
        result.modelsSkipped += provider.models.length - missingModels.length;
        const newModels = missingModels.map((model) => mapModel(provider, model, configuration));
        for (const model of missingModels) {
          if (!configuration.presetProviderId) {
            assertCustomProviderModelEndpointTypes({
              ...configuration,
              endpointTypes: model.endpointTypes ?? [],
            });
          }
        }
        // Keep each statement within SQLite's conservative variable limit.
        const batchSize = newModels[0]
          ? Math.max(1, Math.floor(999 / (Object.keys(newModels[0]).length + 3)))
          : 1;
        for (let offset = 0; offset < newModels.length; offset += batchSize) {
          signal.throwIfAborted();
          await insertManyWithOrderKey(
            tx,
            userModelTable,
            newModels.slice(offset, offset + batchSize),
            {
              pkColumn: userModelTable.id,
              scope: eq(userModelTable.providerId, providerId),
            },
          );
        }
        result.modelsAdded += newModels.length;
      }

      const [connection] = await tx
        .update(desktopConnectionTable)
        .set({ lastFetchedAt: Date.now(), status: 'paired' })
        .where(eq(desktopConnectionTable.id, id))
        .returning({ id: desktopConnectionTable.id });
      if (!connection) throw DataApiErrorFactory.notFound('DesktopConnection', id);
      signal.throwIfAborted();
      return result;
    });
  }
}

export const desktopConnectionService = new DesktopConnectionService();
