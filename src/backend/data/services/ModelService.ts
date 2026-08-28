import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentTable, monotonicUpdateTimestamp } from '@/backend/data/db/schemas';
import type { InsertUserModelRow, UserModelRow } from '@/backend/data/db/schemas/userModel';
import { userModelTable } from '@/backend/data/db/schemas/userModel';
import { DataApiErrorFactory, ErrorCode } from '@/shared/data/api/errors';
import type {
  CreateModelDto,
  ModelListQuery,
  UpdateModelDto,
} from '@/shared/data/api/schemas/models';
import {
  createUniqueModelId,
  type EndpointType,
  type Model,
  parseUniqueModelId,
  type UniqueModelId,
} from '@/shared/data/types/model';
import { deepEqual } from '@/shared/utils/deepEqual';

import {
  createCustomModel,
  type ModelRegistryLookup,
  mergePresetModel,
  providerRegistryService,
} from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

const sqliteBatchSize = 500;
const sqliteMaxVariables = 999;
const userModelGeneratedVariablesPerRow = 3;
const modelInUseAsDefaultReason = 'model is in use as the default model';

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
type UpdateField = keyof UpdateModelDto;

export const UPDATE_MODEL_FIELD_MAP: Array<UpdateField | [UpdateField, keyof InsertUserModelRow]> =
  [
    'name',
    'description',
    'group',
    'capabilities',
    'inputModalities',
    'outputModalities',
    'endpointTypes',
    ['parameterSupport', 'parameters'],
    'supportsStreaming',
    'contextWindow',
    'maxInputTokens',
    'maxOutputTokens',
    'pricing',
    'isEnabled',
    'isHidden',
    'isDeprecated',
    'notes',
  ];

const presetDeltaFields = new Set<keyof InsertUserModelRow>([
  'name',
  'description',
  'group',
  'capabilities',
  'inputModalities',
  'outputModalities',
  'endpointTypes',
  'contextWindow',
  'maxInputTokens',
  'maxOutputTokens',
  'supportsStreaming',
  'parameters',
  'pricing',
]);

function applyStoredFields(baseline: Model, row: UserModelRow): Model {
  const reasoning = row.reasoning
    ? {
        ...row.reasoning,
        selectableEfforts: row.reasoning.selectableEfforts ?? row.reasoning.supportedEfforts ?? [],
      }
    : baseline.reasoning;

  return {
    ...baseline,
    apiModelId: row.modelId,
    ...(row.capabilities !== null ? { capabilities: row.capabilities } : {}),
    ...(row.contextWindow !== null ? { contextWindow: row.contextWindow } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.endpointTypes !== null ? { endpointTypes: row.endpointTypes } : {}),
    ...(row.group !== null ? { group: row.group } : {}),
    id: createUniqueModelId(row.providerId, row.modelId),
    ...(row.inputModalities !== null ? { inputModalities: row.inputModalities } : {}),
    isDeprecated: row.isDeprecated,
    isEnabled: row.isEnabled,
    isHidden: row.isHidden,
    ...(row.maxInputTokens !== null ? { maxInputTokens: row.maxInputTokens } : {}),
    ...(row.maxOutputTokens !== null ? { maxOutputTokens: row.maxOutputTokens } : {}),
    modelId: row.modelId,
    ...(row.name !== null ? { name: row.name } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.outputModalities !== null ? { outputModalities: row.outputModalities } : {}),
    ...(row.parameters !== null
      ? {
          parameterSupport: row.parameters as Model['parameterSupport'],
          parameters: row.parameters,
        }
      : {}),
    presetModelId: row.presetModelId,
    ...(row.pricing !== null ? { pricing: row.pricing } : {}),
    providerId: row.providerId,
    ...(reasoning ? { reasoning } : {}),
    ...(row.supportsStreaming !== null ? { supportsStreaming: row.supportsStreaming } : {}),
  };
}

function enrichModelFromRegistry(row: UserModelRow): Model {
  let registryData = providerRegistryService.lookupModel(row.providerId, row.modelId);
  if (!registryData.presetModel && row.presetModelId) {
    registryData = providerRegistryService.lookupModel(row.providerId, row.presetModelId);
  }

  const registryBaseline = registryData.presetModel
    ? mergePresetModel(
        registryData.presetModel,
        registryData.registryOverride,
        row.providerId,
        registryData.reasoningProfile.wire,
        registryData.reasoningProfile.support,
      )
    : undefined;
  const baseline = row.presetModelId
    ? (registryBaseline ?? createCustomModel(row.providerId, row.modelId))
    : createCustomModel(row.providerId, row.modelId);
  const model = applyStoredFields(baseline, row);

  if (!row.presetModelId && registryBaseline) {
    return {
      ...model,
      ...(registryBaseline.imageGeneration
        ? { imageGeneration: registryBaseline.imageGeneration }
        : {}),
      ...(registryBaseline.ownedBy ? { ownedBy: registryBaseline.ownedBy } : {}),
      ...(registryBaseline.reasoning && !row.reasoning
        ? { reasoning: registryBaseline.reasoning }
        : {}),
      ...(registryBaseline.supportsFastMode ? { supportsFastMode: true } : {}),
    };
  }

  return model;
}

function customInputToInsert(input: CreateModelInput): ModelInputWithoutOrderKey {
  return {
    capabilities: input.capabilities ?? [],
    contextWindow: input.contextWindow ?? null,
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
    presetModelId: null,
    pricing: input.pricing ?? null,
    providerId: input.providerId,
    reasoning: input.reasoning ?? null,
    supportsStreaming: input.supportsStreaming ?? true,
  };
}

function presetDeltaToInsert(
  input: CreateModelInput,
  baseline: Model,
  presetModelId: string,
): ModelInputWithoutOrderKey {
  const delta = <TValue>(value: TValue | null | undefined, inherited: TValue | undefined) =>
    value !== undefined && !deepEqual(value, inherited) ? (value ?? null) : null;

  return {
    capabilities: delta(input.capabilities, baseline.capabilities),
    contextWindow: delta(input.contextWindow, baseline.contextWindow),
    description: delta(input.description, baseline.description),
    endpointTypes: delta(input.endpointTypes, baseline.endpointTypes),
    group: delta(input.group, baseline.group),
    id: createUniqueModelId(input.providerId, input.modelId),
    inputModalities: delta(input.inputModalities, baseline.inputModalities),
    isDeprecated: input.isDeprecated ?? baseline.isDeprecated ?? false,
    isEnabled: input.isEnabled ?? baseline.isEnabled,
    isHidden: input.isHidden ?? baseline.isHidden,
    maxInputTokens: delta(input.maxInputTokens, baseline.maxInputTokens),
    maxOutputTokens: delta(input.maxOutputTokens, baseline.maxOutputTokens),
    modelId: input.modelId,
    name: delta(input.name, baseline.name),
    notes: null,
    outputModalities: delta(input.outputModalities, baseline.outputModalities),
    parameters: delta(
      input.parameters,
      baseline.parameterSupport as CreateModelInput['parameters'],
    ),
    presetModelId,
    pricing: delta(input.pricing, baseline.pricing),
    providerId: input.providerId,
    reasoning: null,
    supportsStreaming: delta(input.supportsStreaming, baseline.supportsStreaming),
  };
}

function buildCreateValues(input: CreateModelInput): ModelInputWithoutOrderKey {
  if (!input.registryData?.presetModel) {
    return customInputToInsert(input);
  }

  const baseline = mergePresetModel(
    input.registryData.presetModel,
    input.registryData.registryOverride,
    input.providerId,
    input.registryData.reasoningProfile.wire,
    input.registryData.reasoningProfile.support,
  );
  return presetDeltaToInsert(input, baseline, input.registryData.presetModel.id);
}

function dtoToCreateInput(
  dto: CreateModelDto,
  registryData?: ModelRegistryLookup,
): CreateModelInput {
  return {
    ...dto,
    parameters: dto.parameterSupport,
    registryData,
  };
}

export class ModelService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get preferenceService() {
    return application.get('PreferenceService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async list(query: ModelListQuery = {}): Promise<Model[]> {
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

  async getByKey(providerId: string, modelId: string): Promise<Model> {
    const [row] = await this.db
      .select()
      .from(userModelTable)
      .where(and(eq(userModelTable.providerId, providerId), eq(userModelTable.modelId, modelId)))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('Model', `${providerId}/${modelId}`);
    }
    return enrichModelFromRegistry(row);
  }

  async create(input: CreateModelInput): Promise<Model> {
    const row = (await this.dbService.withWriteTx((tx) =>
      insertWithOrderKey(tx, userModelTable, buildCreateValues(input), {
        pkColumn: userModelTable.id,
        scope: eq(userModelTable.providerId, input.providerId),
      }),
    )) as UserModelRow;
    return enrichModelFromRegistry(row);
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
        // react-doctor-disable-next-line async-await-in-loop -- order keys depend on prior writes in this transaction
        const inserted = (await insertManyWithOrderKey(tx, userModelTable, scopedValues, {
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, providerId),
        })) as UserModelRow[];
        result.push(...inserted);
      }
      return result;
    });
    return rows.map(enrichModelFromRegistry);
  }

  async createDtos(dtos: CreateModelDto[]): Promise<Model[]> {
    const inputs = dtos.map((dto) =>
      dtoToCreateInput(dto, providerRegistryService.lookupModel(dto.providerId, dto.modelId)),
    );
    return this.batchCreate(inputs);
  }

  async update(providerId: string, modelId: string, dto: UpdateModelDto): Promise<Model> {
    return this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(userModelTable)
        .where(and(eq(userModelTable.providerId, providerId), eq(userModelTable.modelId, modelId)))
        .limit(1);
      if (!existing) {
        throw DataApiErrorFactory.notFound('Model', `${providerId}/${modelId}`);
      }

      const updates = this.buildUpdates(existing, dto);
      if (Object.keys(updates).length === 0) {
        return enrichModelFromRegistry(existing);
      }
      const [row] = await tx
        .update(userModelTable)
        .set(updates)
        .where(and(eq(userModelTable.providerId, providerId), eq(userModelTable.modelId, modelId)))
        .returning();
      return enrichModelFromRegistry(row);
    });
  }

  async bulkUpdate(
    items: Array<{ modelId: string; patch: UpdateModelDto; providerId: string }>,
  ): Promise<Model[]> {
    if (items.length === 0) {
      return [];
    }
    const rows = await this.dbService.withWriteTx(async (tx) => {
      const result: UserModelRow[] = [];
      for (const { modelId, patch, providerId } of items) {
        // react-doctor-disable-next-line async-await-in-loop -- the transaction must preserve request order and atomicity
        const [existing] = await tx
          .select()
          .from(userModelTable)
          .where(
            and(eq(userModelTable.providerId, providerId), eq(userModelTable.modelId, modelId)),
          )
          .limit(1);
        if (!existing) {
          throw DataApiErrorFactory.notFound('Model', `${providerId}/${modelId}`);
        }
        const updates = this.buildUpdates(existing, patch);
        if (Object.keys(updates).length === 0) {
          result.push(existing);
          continue;
        }
        // react-doctor-disable-next-line async-await-in-loop -- see transaction ordering above
        const [row] = await tx
          .update(userModelTable)
          .set(updates)
          .where(
            and(eq(userModelTable.providerId, providerId), eq(userModelTable.modelId, modelId)),
          )
          .returning();
        result.push(row);
      }
      return result;
    });
    return rows.map(enrichModelFromRegistry);
  }

  /** Compatibility method used by the mobile workflow backend. */
  async delete(id: UniqueModelId): Promise<boolean> {
    const { modelId, providerId } = parseUniqueModelId(id);
    try {
      await this.deleteByKey(providerId, modelId);
      return true;
    } catch (error) {
      if (isDataApiCode(error, ErrorCode.NOT_FOUND) || isDefaultModelError(error)) {
        return false;
      }
      throw error;
    }
  }

  async deleteByKey(providerId: string, modelId: string): Promise<void> {
    const id = createUniqueModelId(providerId, modelId);
    await this.assertNotUsedAsDefault(id, `delete model ${id}`);

    await this.dbService.withWriteTx(async (tx) => {
      await tx
        .update(agentTable)
        .set({ updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt) })
        .where(eq(agentTable.modelId, id));
      const rows = await tx
        .delete(userModelTable)
        .where(and(eq(userModelTable.providerId, providerId), eq(userModelTable.modelId, modelId)))
        .returning({ id: userModelTable.id });
      if (rows.length === 0) {
        throw DataApiErrorFactory.notFound('Model', `${providerId}/${modelId}`);
      }
    });
  }

  async bulkDelete(items: Array<{ modelId: string; providerId: string }>): Promise<void> {
    const uniqueItems = new Map<string, { modelId: string; providerId: string }>();
    for (const item of items) {
      uniqueItems.set(createUniqueModelId(item.providerId, item.modelId), item);
    }
    const ids = [...uniqueItems.keys()];
    if (ids.length === 0) {
      return;
    }
    for (const id of ids) {
      await this.assertNotUsedAsDefault(id, `delete model ${id}`);
    }

    await this.dbService.withWriteTx(async (tx) => {
      const existingIds = new Set<string>();
      for (const idChunk of chunks(ids, sqliteBatchSize)) {
        // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
        const rows = await tx
          .select({ id: userModelTable.id })
          .from(userModelTable)
          .where(inArray(userModelTable.id, idChunk));
        for (const row of rows) {
          existingIds.add(row.id);
        }
      }
      const missingId = ids.find((id) => !existingIds.has(id));
      if (missingId) {
        throw DataApiErrorFactory.notFound('Model', missingId);
      }

      for (const idChunk of chunks(ids, sqliteBatchSize)) {
        // Keep Agent row versions ahead of the FK's modelId -> null cascade.
        // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
        await tx
          .update(agentTable)
          .set({ updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt) })
          .where(inArray(agentTable.modelId, idChunk));
        // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
        await tx.delete(userModelTable).where(inArray(userModelTable.id, idChunk));
      }
    });
  }

  async reconcileProviderModels(
    providerId: string,
    input: ReconcileProviderModelsInput,
    providerConfig?: {
      defaultChatEndpoint?: EndpointType | null;
      presetProviderId?: string | null;
    },
  ): Promise<ReconcileProviderModelsResult> {
    const result = await this.applyReconcile(providerId, input, providerConfig, false);
    return {
      added: result.inserted.map(enrichModelFromRegistry),
      removedIds: result.removedIds,
    };
  }

  async reconcileForProvider(
    providerId: string,
    input: { toAdd: CreateModelDto[]; toRemove: string[] },
  ): Promise<Model[]> {
    const toAdd = input.toAdd.map((dto) =>
      dtoToCreateInput(dto, providerRegistryService.lookupModel(providerId, dto.modelId)),
    );
    const result = await this.applyReconcile(
      providerId,
      { toAdd, toRemove: input.toRemove },
      undefined,
      true,
    );
    return (result.allRows ?? []).map(enrichModelFromRegistry);
  }

  async createFromRegistry(
    input: Omit<CreateModelInput, 'registryData'>,
    providerConfig?: {
      defaultChatEndpoint?: EndpointType | null;
      presetProviderId?: string | null;
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
    const rows = await this.db.select().from(userModelTable).where(inArray(userModelTable.id, ids));
    for (const model of rows.map(enrichModelFromRegistry)) {
      if (model.name) {
        result.set(model.id, model.name);
      }
    }
    return result;
  }

  private buildUpdates(existing: UserModelRow, dto: UpdateModelDto): Partial<InsertUserModelRow> {
    const updates: Partial<InsertUserModelRow> = {};
    let baseline: Model | null = null;
    if (existing.presetModelId) {
      const lookup = providerRegistryService.lookupModel(existing.providerId, existing.modelId);
      if (lookup.presetModel) {
        baseline = mergePresetModel(
          lookup.presetModel,
          lookup.registryOverride,
          existing.providerId,
          lookup.reasoningProfile.wire,
          lookup.reasoningProfile.support,
        );
      }
    }

    for (const entry of UPDATE_MODEL_FIELD_MAP) {
      const [dtoKey, dbKey] = Array.isArray(entry)
        ? entry
        : [entry, entry as keyof InsertUserModelRow];
      const value = dto[dtoKey];
      if (value === undefined) {
        continue;
      }
      const baselineKey = dbKey === 'parameters' ? 'parameterSupport' : dbKey;
      const storedValue =
        existing.presetModelId && baseline && presetDeltaFields.has(dbKey)
          ? deepEqual(value, baseline[baselineKey as keyof Model])
            ? null
            : value
          : value;
      (updates as Record<string, unknown>)[dbKey] = storedValue;
    }
    return updates;
  }

  private async applyReconcile(
    providerId: string,
    input: ReconcileProviderModelsInput,
    providerConfig:
      | {
          defaultChatEndpoint?: EndpointType | null;
          presetProviderId?: string | null;
        }
      | undefined,
    includeAllRows: boolean,
  ): Promise<{ allRows?: UserModelRow[]; inserted: UserModelRow[]; removedIds: string[] }> {
    const toAdd = input.toAdd ?? [];
    const requestedRemoveIds = Array.from(new Set(input.toRemove ?? []));
    if (toAdd.length === 0 && requestedRemoveIds.length === 0 && !includeAllRows) {
      return { inserted: [], removedIds: [] };
    }

    const values = toAdd.map((model) => {
      const registryData =
        model.registryData ??
        providerRegistryService.lookupModel(providerId, model.modelId, providerConfig);
      return buildCreateValues({ ...model, providerId, registryData });
    });
    const defaultIds = await this.getUserDefaultModelIds();

    return this.dbService.withWriteTx(async (tx) => {
      const existingRows: Pick<UserModelRow, 'id' | 'presetModelId'>[] = [];
      for (const idChunk of chunks(requestedRemoveIds, sqliteBatchSize)) {
        // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
        existingRows.push(
          ...(await tx
            .select({ id: userModelTable.id, presetModelId: userModelTable.presetModelId })
            .from(userModelTable)
            .where(
              and(eq(userModelTable.providerId, providerId), inArray(userModelTable.id, idChunk)),
            )),
        );
      }

      const protectedIds = new Set(
        existingRows.flatMap((row) =>
          !row.presetModelId || defaultIds.has(row.id) ? [row.id] : [],
        ),
      );
      const removableIds = existingRows.flatMap((row) =>
        protectedIds.has(row.id) ? [] : [row.id],
      );
      const removedIds: string[] = [];
      for (const idChunk of chunks(removableIds, sqliteBatchSize)) {
        // Keep Agent row versions ahead of the FK's modelId -> null cascade.
        // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
        await tx
          .update(agentTable)
          .set({ updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt) })
          .where(inArray(agentTable.modelId, idChunk));
        // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
        const rows = await tx
          .delete(userModelTable)
          .where(
            and(eq(userModelTable.providerId, providerId), inArray(userModelTable.id, idChunk)),
          )
          .returning({ id: userModelTable.id });
        removedIds.push(...rows.map((row: { id: string }) => row.id));
      }
      const inserted: UserModelRow[] = [];
      const insertableValues = values.filter((value) => !protectedIds.has(value.id));
      for (const valueChunk of chunks(insertableValues, getInsertBatchSize(insertableValues))) {
        // react-doctor-disable-next-line async-await-in-loop -- later order keys depend on prior chunks
        inserted.push(
          ...((await insertManyWithOrderKey(tx, userModelTable, valueChunk, {
            pkColumn: userModelTable.id,
            scope: eq(userModelTable.providerId, providerId),
          })) as UserModelRow[]),
        );
      }

      const allRows = includeAllRows
        ? ((await tx
            .select()
            .from(userModelTable)
            .where(eq(userModelTable.providerId, providerId))
            .orderBy(asc(userModelTable.orderKey))) as UserModelRow[])
        : undefined;
      return { allRows, inserted, removedIds };
    });
  }

  private async assertNotUsedAsDefault(id: string, operation: string): Promise<void> {
    if ((await this.getUserDefaultModelIds()).has(id)) {
      throw DataApiErrorFactory.invalidOperation(operation, modelInUseAsDefaultReason);
    }
  }

  private async getUserDefaultModelIds(): Promise<Set<string>> {
    const values = await Promise.all([
      this.preferenceService.get('agent.default_model_id'),
      this.preferenceService.get('feature.paintings.default_model_id'),
      this.preferenceService.get('feature.quick_assistant.model_id'),
      this.preferenceService.get('feature.translate.model_id'),
    ]);
    return new Set(values.filter((id): id is string => typeof id === 'string' && id.length > 0));
  }
}

export const modelService = new ModelService();

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
      Math.max(maximum, Object.keys(value).length + userModelGeneratedVariablesPerRow),
    1,
  );
  return Math.max(1, Math.floor(sqliteMaxVariables / variablesPerRow));
}

function isDataApiCode(error: unknown, code: ErrorCode): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isDefaultModelError(error: unknown): boolean {
  return (
    isDataApiCode(error, ErrorCode.INVALID_OPERATION) &&
    error instanceof Error &&
    error.message.includes(modelInUseAsDefaultReason)
  );
}
