import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';

import type { DbService } from '@/data/db/DbService';
import type { InsertUserModelRow, UserModelRow } from '@/data/db/schemas/userModel';
import { userModelTable } from '@/data/db/schemas/userModel';
import { createUniqueModelId, type EndpointType, type Model } from '@/data/types/model';
import type { EndpointConfigs } from '@/data/types/provider';

import {
  type ModelRegistryLookup,
  mergePresetModel,
  providerRegistryService,
} from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

export type CreateModelInput = {
  capabilities?: InsertUserModelRow['capabilities'];
  contextWindow?: number | null;
  description?: string | null;
  endpointTypes?: InsertUserModelRow['endpointTypes'];
  group?: string | null;
  inputModalities?: InsertUserModelRow['inputModalities'];
  isDeprecated?: boolean;
  isEnabled?: boolean;
  isHidden?: boolean;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  modelId: string;
  name?: string | null;
  outputModalities?: InsertUserModelRow['outputModalities'];
  ownedBy?: string | null;
  parameters?: InsertUserModelRow['parameters'];
  presetModelId?: string | null;
  pricing?: InsertUserModelRow['pricing'];
  providerId: string;
  reasoning?: InsertUserModelRow['reasoning'];
  registryData?: ModelRegistryLookup;
  supportsStreaming?: boolean;
};

export type ReconcileProviderModelsInput = {
  toAdd?: CreateModelInput[];
  toRemove?: string[];
};

export type ReconcileProviderModelsResult = {
  added: Model[];
  removedIds: string[];
};

type ModelInputWithoutOrderKey = Omit<InsertUserModelRow, 'orderKey'>;

function rowToModel(row: UserModelRow): Model {
  return {
    apiModelId: row.modelId,
    capabilities: row.capabilities,
    contextWindow: row.contextWindow ?? undefined,
    customEndpointUrl: row.customEndpointUrl ?? undefined,
    description: row.description ?? undefined,
    endpointTypes: row.endpointTypes ?? undefined,
    group: row.group ?? undefined,
    id: createUniqueModelId(row.providerId, row.modelId),
    inputModalities: row.inputModalities ?? undefined,
    isDeprecated: row.isDeprecated,
    isEnabled: row.isEnabled,
    isHidden: row.isHidden,
    maxInputTokens: row.maxInputTokens ?? undefined,
    maxOutputTokens: row.maxOutputTokens ?? undefined,
    modelId: row.modelId,
    name: row.name,
    outputModalities: row.outputModalities ?? undefined,
    ownedBy: row.ownedBy ?? undefined,
    parameters: row.parameters ?? undefined,
    presetModelId: row.presetModelId ?? undefined,
    pricing: row.pricing ?? undefined,
    providerId: row.providerId,
    reasoning: row.reasoning ?? undefined,
    supportsStreaming: row.supportsStreaming,
  };
}

function modelToInsert(model: Model): ModelInputWithoutOrderKey {
  return {
    capabilities: model.capabilities,
    contextWindow: model.contextWindow ?? null,
    customEndpointUrl: model.customEndpointUrl ?? null,
    description: model.description ?? null,
    endpointTypes: model.endpointTypes ?? null,
    group: model.group ?? null,
    id: createUniqueModelId(model.providerId, model.modelId),
    inputModalities: model.inputModalities ?? null,
    isDeprecated: model.isDeprecated,
    isEnabled: model.isEnabled,
    isHidden: model.isHidden,
    maxInputTokens: model.maxInputTokens ?? null,
    maxOutputTokens: model.maxOutputTokens ?? null,
    modelId: model.modelId,
    name: model.name,
    notes: null,
    outputModalities: model.outputModalities ?? null,
    ownedBy: model.ownedBy ?? null,
    parameters: model.parameters ?? null,
    presetModelId: model.presetModelId ?? null,
    pricing: model.pricing ?? null,
    providerId: model.providerId,
    reasoning: model.reasoning ?? null,
    supportsStreaming: model.supportsStreaming,
    userOverrides: null,
  };
}

function customInputToInsert(input: CreateModelInput): ModelInputWithoutOrderKey {
  return {
    capabilities: input.capabilities ?? [],
    contextWindow: input.contextWindow ?? null,
    customEndpointUrl: null,
    description: input.description ?? null,
    endpointTypes: input.endpointTypes ?? null,
    group: input.group ?? null,
    id: createUniqueModelId(input.providerId, input.modelId),
    inputModalities: input.inputModalities ?? null,
    isDeprecated: input.isDeprecated ?? false,
    isEnabled: input.isEnabled ?? true,
    isHidden: input.isHidden ?? false,
    maxInputTokens: input.maxInputTokens ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    modelId: input.modelId,
    name: input.name ?? input.modelId,
    notes: null,
    outputModalities: input.outputModalities ?? null,
    ownedBy: input.ownedBy ?? null,
    parameters: input.parameters ?? null,
    presetModelId: input.presetModelId ?? null,
    pricing: input.pricing ?? null,
    providerId: input.providerId,
    reasoning: input.reasoning ?? null,
    supportsStreaming: input.supportsStreaming ?? true,
    userOverrides: null,
  };
}

function buildCreateValues(input: CreateModelInput): ModelInputWithoutOrderKey {
  const registryData = input.registryData;
  if (!registryData?.presetModel) {
    return customInputToInsert(input);
  }

  const merged = mergePresetModel(
    registryData.presetModel,
    registryData.registryOverride,
    input.providerId,
    registryData.reasoningFormatTypes,
    registryData.defaultChatEndpoint,
  );

  return {
    ...modelToInsert({
      ...merged,
      description: input.description ?? merged.description,
      group: input.group ?? merged.group,
      isDeprecated: input.isDeprecated ?? merged.isDeprecated,
      isEnabled: input.isEnabled ?? merged.isEnabled,
      isHidden: input.isHidden ?? merged.isHidden,
      modelId: input.modelId,
      name: input.name ?? merged.name,
      ownedBy: input.ownedBy ?? merged.ownedBy,
      presetModelId: registryData.presetModel.id,
      supportsStreaming: input.supportsStreaming ?? merged.supportsStreaming,
    }),
  };
}

export class ModelService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async list(
    query: { capability?: string; enabled?: boolean; providerId?: string } = {},
  ): Promise<Model[]> {
    const conditions: SQL[] = [];

    if (query.providerId) {
      conditions.push(eq(userModelTable.providerId, query.providerId));
    }

    if (query.enabled !== undefined) {
      conditions.push(eq(userModelTable.isEnabled, query.enabled));
    }

    const rows = await this.db
      .select()
      .from(userModelTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(userModelTable.providerId), asc(userModelTable.orderKey));
    const models = rows.map(rowToModel);

    return query.capability
      ? models.filter((model) => model.capabilities.includes(query.capability as never))
      : models;
  }

  async getById(id: string): Promise<Model | null> {
    const [row] = await this.db
      .select()
      .from(userModelTable)
      .where(eq(userModelTable.id, id))
      .limit(1);
    return row ? rowToModel(row) : null;
  }

  async create(input: CreateModelInput): Promise<Model> {
    const row = (await this.dbService.withWriteTx((tx) =>
      insertWithOrderKey(tx, userModelTable, buildCreateValues(input), {
        pkColumn: userModelTable.id,
        scope: eq(userModelTable.providerId, input.providerId),
      }),
    )) as UserModelRow;

    return rowToModel(row);
  }

  async batchCreate(inputs: CreateModelInput[]): Promise<Model[]> {
    if (inputs.length === 0) {
      return [];
    }

    const values = inputs.map(buildCreateValues);
    const rows = await this.dbService.withWriteTx(async (tx) => {
      const result: UserModelRow[] = [];
      for (const providerId of new Set(values.map((value) => value.providerId))) {
        const scopedValues = values.filter((value) => value.providerId === providerId);
        const inserted = (await insertManyWithOrderKey(tx, userModelTable, scopedValues, {
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, providerId),
        })) as UserModelRow[];
        result.push(...inserted);
      }
      return result;
    });

    return rows.map(rowToModel);
  }

  async reconcileProviderModels(
    providerId: string,
    input: ReconcileProviderModelsInput,
    providerConfig?: {
      defaultChatEndpoint?: EndpointType | null;
      endpointConfigs?: EndpointConfigs | null;
    },
  ): Promise<ReconcileProviderModelsResult> {
    const toAdd = input.toAdd ?? [];
    const toRemove = Array.from(new Set(input.toRemove ?? []));

    if (toAdd.length === 0 && toRemove.length === 0) {
      return { added: [], removedIds: [] };
    }

    const values = toAdd.map((model) => {
      const normalizedInput = {
        ...model,
        providerId,
      };
      const registryData =
        model.registryData ??
        providerRegistryService.lookupModel(providerId, model.modelId, providerConfig);

      return buildCreateValues({ ...normalizedInput, registryData });
    });

    const rows = await this.dbService.withWriteTx(async (tx) => {
      const inserted =
        values.length > 0
          ? ((await insertManyWithOrderKey(tx, userModelTable, values, {
              pkColumn: userModelTable.id,
              scope: eq(userModelTable.providerId, providerId),
            })) as UserModelRow[])
          : [];

      if (toRemove.length > 0) {
        await tx
          .delete(userModelTable)
          .where(
            and(eq(userModelTable.providerId, providerId), inArray(userModelTable.id, toRemove)),
          );
      }

      return inserted;
    });

    return {
      added: rows.map(rowToModel),
      removedIds: toRemove,
    };
  }

  async createFromRegistry(
    input: Omit<CreateModelInput, 'registryData'>,
    providerConfig?: {
      defaultChatEndpoint?: EndpointType | null;
      endpointConfigs?: EndpointConfigs | null;
    },
  ): Promise<Model> {
    const registryData = providerRegistryService.lookupModel(
      input.providerId,
      input.modelId,
      providerConfig,
    );
    return this.create({ ...input, registryData });
  }

  async getNamesByUniqueIds(
    uniqueIds: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const ids = Array.from(
      new Set(uniqueIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    );
    if (ids.length === 0) {
      return result;
    }

    const rows = await this.db
      .select({ id: userModelTable.id, name: userModelTable.name })
      .from(userModelTable)
      .where(inArray(userModelTable.id, ids));

    for (const row of rows) {
      result.set(row.id, row.name);
    }

    return result;
  }
}
