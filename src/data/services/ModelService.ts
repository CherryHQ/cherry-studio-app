import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';

import type { DbService } from '@/data/db/DbService';
import type {
  InsertUserModelRow,
  RegistryEnrichableField,
  UserModelRow,
} from '@/data/db/schemas/userModel';
import { userModelTable } from '@/data/db/schemas/userModel';
import {
  createUniqueModelId,
  type EndpointType,
  MODEL_CAPABILITY,
  type Model,
  type ModelCapability,
  type UniqueModelId,
} from '@/shared/domain/model';
import type { EndpointConfigs } from '@/shared/domain/provider';
import type { PinService } from './PinService';
import type { PreferenceService } from './PreferenceService';
import {
  type ModelRegistryLookup,
  mergePresetModel,
  providerRegistryService,
} from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

const SQLITE_BATCH_SIZE = 500;
const SQLITE_MAX_VARIABLES = 999;
const USER_MODEL_GENERATED_VARIABLES_PER_ROW = 3;

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
    parameters: row.parameters ?? undefined,
    presetModelId: row.presetModelId ?? undefined,
    pricing: row.pricing ?? undefined,
    providerId: row.providerId,
    reasoning: row.reasoning ?? undefined,
    supportsStreaming: row.supportsStreaming,
  };
}

function resolveCapabilities(
  presetCapabilities: readonly ModelCapability[] | undefined,
  overrideCapabilities:
    | { add?: ModelCapability[]; force?: ModelCapability[]; remove?: ModelCapability[] }
    | undefined,
  userCapabilities: readonly ModelCapability[],
): ModelCapability[] {
  if (overrideCapabilities?.force) {
    return [...overrideCapabilities.force];
  }

  const capabilities = new Set<ModelCapability>(userCapabilities);
  if (presetCapabilities?.includes(MODEL_CAPABILITY.IMAGE_GENERATION)) {
    capabilities.add(MODEL_CAPABILITY.IMAGE_GENERATION);
  }

  if (overrideCapabilities?.add) {
    for (const capability of overrideCapabilities.add) {
      capabilities.add(capability);
    }
  }

  if (overrideCapabilities?.remove) {
    for (const capability of overrideCapabilities.remove) {
      capabilities.delete(capability);
    }
  }

  return [...capabilities];
}

function hasUserOverride(
  userOverrides: readonly RegistryEnrichableField[] | null | undefined,
  field: RegistryEnrichableField,
): boolean {
  return userOverrides?.includes(field) ?? false;
}

function lookupRegistryDataForModel(model: Model): ModelRegistryLookup {
  const apiModelId = model.apiModelId ?? model.modelId;
  const byApiModelId = providerRegistryService.lookupModel(model.providerId, apiModelId);
  if (byApiModelId.presetModel || byApiModelId.registryOverride || !model.presetModelId) {
    return byApiModelId;
  }

  return providerRegistryService.lookupModel(model.providerId, model.presetModelId);
}

function enrichModelFromRegistry(row: UserModelRow): Model {
  const model = rowToModel(row);
  const registryData = lookupRegistryDataForModel(model);
  if (!registryData.presetModel) {
    return model;
  }

  const updates: Partial<Model> = {};
  const userOverrides = row.userOverrides;

  if (!hasUserOverride(userOverrides, 'capabilities')) {
    const capabilities = resolveCapabilities(
      registryData.presetModel.capabilities,
      registryData.registryOverride?.capabilities,
      model.capabilities,
    );
    const capabilitiesChanged =
      capabilities.length !== model.capabilities.length ||
      capabilities.some((capability, index) => capability !== model.capabilities[index]);
    if (capabilitiesChanged) {
      updates.capabilities = capabilities;
    }
  }

  const imageGeneration =
    registryData.registryOverride?.imageGeneration ?? registryData.presetModel.imageGeneration;
  if (imageGeneration) {
    updates.imageGeneration = imageGeneration;
  }

  return Object.keys(updates).length > 0 ? { ...model, ...updates } : model;
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
      presetModelId: registryData.presetModel.id,
      supportsStreaming: input.supportsStreaming ?? merged.supportsStreaming,
    }),
  };
}

export class ModelService {
  constructor(
    private readonly dbService: DbService,
    private readonly preferenceService: PreferenceService,
    private readonly pinService: PinService,
  ) {}

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
    const models = rows.map(enrichModelFromRegistry);

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
    return row ? enrichModelFromRegistry(row) : null;
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

  /**
   * Removes one model from its provider.
   *
   * Unlike {@link reconcileProviderModels} this deletes a hand-added model too:
   * there the absence of a `presetModelId` means "the remote list cannot speak
   * for this one", while here the user is pointing at the row. The chat default
   * is still refused — dropping it would leave the preference dangling — and the
   * caller is expected to have disabled the affordance, so `false` is the
   * backstop rather than the message.
   *
   * Rows that reference the model (`assistant.modelId`, `message.modelId`) are
   * `ON DELETE SET NULL`, so only pins need purging by hand.
   */
  async delete(id: UniqueModelId): Promise<boolean> {
    const defaultModelId = await this.preferenceService.get('chat.default_model_id');
    if (id === defaultModelId) {
      return false;
    }

    return await this.dbService.withWriteTx(async (tx) => {
      const deletedRows = await tx
        .delete(userModelTable)
        .where(eq(userModelTable.id, id))
        .returning({ id: userModelTable.id });

      if (deletedRows.length === 0) {
        return false;
      }

      await this.pinService.purgeForEntitiesTx(tx, 'model', [id]);
      return true;
    });
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
        // react-doctor-disable-next-line async-await-in-loop -- 同一写事务内本质串行，orderKey 生成依赖事务内已写入的边界 key
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
    const requestedRemoveIds = Array.from(new Set(input.toRemove ?? []));

    if (toAdd.length === 0 && requestedRemoveIds.length === 0) {
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

    const defaultModelId = await this.preferenceService.get('chat.default_model_id');
    const { inserted, removedIds } = await this.dbService.withWriteTx(async (tx) => {
      const existingRows: Pick<UserModelRow, 'id' | 'presetModelId'>[] = [];
      for (const ids of chunks(requestedRemoveIds, SQLITE_BATCH_SIZE)) {
        existingRows.push(
          // react-doctor-disable-next-line async-await-in-loop -- 分块规避 SQLite 变量上限，同一写事务内本质串行
          ...(await tx
            .select({ id: userModelTable.id, presetModelId: userModelTable.presetModelId })
            .from(userModelTable)
            .where(
              and(eq(userModelTable.providerId, providerId), inArray(userModelTable.id, ids)),
            )),
        );
      }

      const protectedIds = new Set(
        existingRows.flatMap((row) =>
          !row.presetModelId || row.id === defaultModelId ? [row.id] : [],
        ),
      );
      const removableIds = existingRows.flatMap((row) =>
        protectedIds.has(row.id) ? [] : [row.id],
      );
      const actuallyRemovedIds: string[] = [];

      for (const ids of chunks(removableIds, SQLITE_BATCH_SIZE)) {
        // react-doctor-disable-next-line async-await-in-loop -- 分块删除规避 SQLite 变量上限，同一写事务内本质串行
        const deletedRows = await tx
          .delete(userModelTable)
          .where(and(eq(userModelTable.providerId, providerId), inArray(userModelTable.id, ids)))
          .returning({ id: userModelTable.id });
        actuallyRemovedIds.push(...deletedRows.map((row: { id: string }) => row.id));
      }

      if (actuallyRemovedIds.length > 0) {
        await this.pinService.purgeForEntitiesTx(tx, 'model', actuallyRemovedIds);
      }

      const insertableValues = values.filter((value) => !protectedIds.has(value.id));
      const insertedRows: UserModelRow[] = [];
      for (const valueChunk of chunks(insertableValues, getInsertBatchSize(insertableValues))) {
        insertedRows.push(
          // react-doctor-disable-next-line async-await-in-loop -- 后一分块的 orderKey 依赖前一分块已插入的边界 key，必须串行
          ...((await insertManyWithOrderKey(tx, userModelTable, valueChunk, {
            pkColumn: userModelTable.id,
            scope: eq(userModelTable.providerId, providerId),
          })) as UserModelRow[]),
        );
      }

      return { inserted: insertedRows, removedIds: actuallyRemovedIds };
    });

    return {
      added: inserted.map(rowToModel),
      removedIds,
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

function chunks<TValue>(values: TValue[], size: number): TValue[][] {
  const result: TValue[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

function getInsertBatchSize(values: ModelInputWithoutOrderKey[]): number {
  const variablesPerRow = values.reduce(
    (maximum, value) =>
      Math.max(maximum, Object.keys(value).length + USER_MODEL_GENERATED_VARIABLES_PER_ROW),
    1,
  );
  return Math.max(1, Math.floor(SQLITE_MAX_VARIABLES / variablesPerRow));
}
