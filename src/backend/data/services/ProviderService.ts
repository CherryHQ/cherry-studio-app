import { inferAdapterFamily } from '@cherrystudio/provider-registry';
import { loggerService } from '@logger';
import { and, asc, desc, eq, gt, inArray, isNull, notInArray, or, type SQL } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { application } from '@/backend/core/application/Application';
import { agentTable, monotonicUpdateTimestamp, userModelTable } from '@/backend/data/db/schemas';
import type {
  InsertUserProviderRow,
  UserProviderRow,
} from '@/backend/data/db/schemas/userProvider';
import { userProviderTable } from '@/backend/data/db/schemas/userProvider';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { ProviderListPageQuery } from '@/shared/data/api/schemas/providers';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { EndpointType } from '@/shared/data/types/model';
import type {
  ApiKeyEntry,
  AuthConfig,
  AuthType,
  EndpointConfig,
  EndpointConfigs,
  Provider,
  ProviderSettings,
  RuntimeApiFeatures,
} from '@/shared/data/types/provider';
import {
  DEFAULT_API_FEATURES as DEFAULT_FEATURES,
  DEFAULT_PROVIDER_SETTINGS,
} from '@/shared/data/types/provider';

import { providerRegistryService } from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

const logger = loggerService.withContext('ProviderService');
const DEFAULT_PROVIDER_PAGE_LIMIT = 20;
const MAX_PROVIDER_PAGE_LIMIT = 100;

type ProviderCursor = {
  isEnabled: boolean;
  orderKey: string;
  providerId: string;
};

export type CreateProviderInput = {
  apiFeatures?: InsertUserProviderRow['apiFeatures'];
  apiKeys?: ApiKeyEntry[];
  authConfig?: InsertUserProviderRow['authConfig'];
  defaultChatEndpoint?: InsertUserProviderRow['defaultChatEndpoint'];
  endpointConfigs?: EndpointConfigs | null;
  name: string;
  presetProviderId?: string | null;
  providerId: string;
  providerSettings?: ProviderSettings | null;
};

type ProviderInputWithoutOrderKey = Omit<InsertUserProviderRow, 'orderKey'>;
export type UpdateProviderInput = {
  apiFeatures?: Partial<RuntimeApiFeatures> | null;
  authConfig?: AuthConfig | null;
  defaultChatEndpoint?: InsertUserProviderRow['defaultChatEndpoint'] | null;
  endpointConfigs?: EndpointConfigs | null;
  isEnabled?: boolean;
  name?: string;
  providerSettings?: ProviderSettings | null;
};

export interface ProviderApiKeySnapshot {
  id: string;
  label?: string;
  masked: string;
}

export type ProviderApiKeySelection =
  | ({ attribution: 'explicit' | 'matched' } & ProviderApiKeySnapshot)
  | { attribution: 'unknown' };

export interface ResolvedProviderApiKey {
  value: string;
  apiKeySelection: ProviderApiKeySelection;
}

function mergeCatalogEndpointConfigs(
  existing: EndpointConfigs | null | undefined,
  catalog: EndpointConfigs | null | undefined,
): EndpointConfigs | null {
  if (!existing && !catalog) {
    return null;
  }

  const merged: EndpointConfigs = {};
  const keys = new Set([
    ...Object.keys(catalog ?? {}),
    ...Object.keys(existing ?? {}),
  ]) as Set<EndpointType>;

  for (const key of keys) {
    const catalogConfig = catalog?.[key];
    const existingConfig = existing?.[key];
    const nextConfig: EndpointConfig = {
      ...catalogConfig,
      ...existingConfig,
    };

    if (catalogConfig?.adapterFamily) {
      nextConfig.adapterFamily = catalogConfig.adapterFamily;
    }
    if (catalogConfig?.reasoningFormatType && !existingConfig?.reasoningFormatType) {
      nextConfig.reasoningFormatType = catalogConfig.reasoningFormatType;
    }
    if (catalogConfig?.modelsApiUrls && !existingConfig?.modelsApiUrls) {
      nextConfig.modelsApiUrls = catalogConfig.modelsApiUrls;
    }

    merged[key] = nextConfig;
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function mergeApiFeatures(
  existing: InsertUserProviderRow['apiFeatures'],
  catalog: InsertUserProviderRow['apiFeatures'],
): InsertUserProviderRow['apiFeatures'] {
  if (!existing && !catalog) {
    return null;
  }

  const merged = {
    ...catalog,
    ...existing,
  };
  return {
    ...(merged.arrayContent !== undefined && { arrayContent: merged.arrayContent }),
    ...(merged.reportsActualCost !== undefined && {
      reportsActualCost: merged.reportsActualCost,
    }),
    ...(merged.serviceTier !== undefined && { serviceTier: merged.serviceTier }),
    ...(merged.streamOptions !== undefined && { streamOptions: merged.streamOptions }),
    ...(merged.verbosity !== undefined && { verbosity: merged.verbosity }),
  };
}

function withInferredAdapterFamilies(
  endpointConfigs: EndpointConfigs | null | undefined,
): EndpointConfigs | null {
  if (!endpointConfigs) {
    return null;
  }

  const configs: EndpointConfigs = {};
  for (const [key, config] of Object.entries(endpointConfigs)) {
    const endpointType = key as EndpointType;
    configs[endpointType] = {
      ...config,
      adapterFamily: config?.adapterFamily ?? inferAdapterFamily(endpointType, config),
    };
  }

  return Object.keys(configs).length > 0 ? configs : null;
}

export type ListProviderApiKeysQuery = {
  enabled?: boolean;
};

export type UpdateApiKeyInput = {
  isEnabled?: boolean;
  key?: string;
  label?: string;
};

function normalizeApiKeys(apiKeys: ApiKeyEntry[] | undefined): ApiKeyEntry[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();

  return (apiKeys ?? []).map((entry) => {
    const id = entry.id || Crypto.randomUUID();
    const key = entry.key.trim();

    if (!key) {
      throw DataApiErrorFactory.validation({ key: ['API key cannot be empty'] });
    }

    if (seenIds.has(id)) {
      throw DataApiErrorFactory.conflict('API key id already exists', 'API key');
    }

    if (seenKeys.has(key)) {
      throw DataApiErrorFactory.conflict('API key already exists', 'API key');
    }

    seenIds.add(id);
    seenKeys.add(key);

    return {
      id,
      isEnabled: entry.isEnabled,
      key,
      ...(entry.label ? { label: entry.label } : {}),
    };
  });
}

function maskApiKeyForSnapshot(key: string): string {
  if (key.length <= 8) return '****';
  if (key.length <= 16) return `${key.slice(0, 2)}****${key.slice(-2)}`;
  if (key.length <= 24) return `${key.slice(0, 4)}****${key.slice(-4)}`;
  return `${key.slice(0, 8)}****${key.slice(-8)}`;
}

function resolvedApiKey(
  value: string,
  attribution: 'explicit' | 'matched',
  entry: ApiKeyEntry,
): ResolvedProviderApiKey {
  return {
    value,
    apiKeySelection: {
      attribution,
      id: entry.id,
      ...(entry.label ? { label: entry.label } : {}),
      masked: maskApiKeyForSnapshot(entry.key),
    },
  };
}

function unknownApiKey(value: string): ResolvedProviderApiKey {
  return { value, apiKeySelection: { attribution: 'unknown' } };
}

function rowToProvider(row: UserProviderRow): Provider {
  const metadata = providerRegistryService.getProviderDisplayMetadata(
    row.providerId,
    row.presetProviderId ?? undefined,
  );
  const apiKeys = (row.apiKeys ?? []).map(({ key: _key, ...rest }) => rest);
  const authType: AuthType = row.authConfig?.type ?? 'api-key';

  return {
    apiFeatures: {
      ...DEFAULT_FEATURES,
      ...mergeApiFeatures(row.apiFeatures, metadata.apiFeatures),
    },
    apiKeys,
    authMethods: metadata.authMethods,
    authOptional: metadata.authOptional,
    authType,
    defaultChatEndpoint: row.defaultChatEndpoint ?? undefined,
    description: metadata.description,
    endpointConfigs: row.endpointConfigs as EndpointConfigs | undefined,
    fastMode: metadata.fastMode,
    id: row.providerId,
    isEnabled: row.isEnabled,
    modelListSource: metadata.modelListSource,
    name: row.name,
    presetProviderId: row.presetProviderId ?? undefined,
    reportedCostCurrency: metadata.reportedCostCurrency,
    settings: {
      ...DEFAULT_PROVIDER_SETTINGS,
      ...(row.providerSettings as Partial<ProviderSettings> | null),
    },
    websites: metadata.websites,
  };
}

function isMobileSupportedProviderRow(row: Pick<UserProviderRow, 'presetProviderId'>): boolean {
  return (
    row.presetProviderId === null ||
    !providerRegistryService.isProviderExcluded(row.presetProviderId)
  );
}

function encodeProviderCursor(cursor: ProviderCursor): string {
  return encodeURIComponent(
    JSON.stringify([cursor.isEnabled ? 1 : 0, cursor.orderKey, cursor.providerId]),
  );
}

function decodeProviderCursor(raw: string | undefined): ProviderCursor | null {
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      (value[0] !== 0 && value[0] !== 1) ||
      typeof value[1] !== 'string' ||
      value[1].length === 0 ||
      typeof value[2] !== 'string' ||
      value[2].length === 0
    ) {
      throw new Error('Invalid provider cursor shape');
    }

    return {
      isEnabled: value[0] === 1,
      orderKey: value[1],
      providerId: value[2],
    };
  } catch {
    logger.warn('decodeCursor: cursor unparseable, falling back to first page', {
      context: 'providers',
      cursor: raw,
    });
    return null;
  }
}

function afterProviderCursor(cursor: ProviderCursor): SQL {
  const afterWithinSection = or(
    gt(userProviderTable.orderKey, cursor.orderKey),
    and(
      eq(userProviderTable.orderKey, cursor.orderKey),
      gt(userProviderTable.providerId, cursor.providerId),
    ),
  )!;

  if (cursor.isEnabled) {
    return or(
      eq(userProviderTable.isEnabled, false),
      and(eq(userProviderTable.isEnabled, true), afterWithinSection),
    )!;
  }

  return and(eq(userProviderTable.isEnabled, false), afterWithinSection)!;
}

function toInsert(input: CreateProviderInput): ProviderInputWithoutOrderKey {
  return {
    apiFeatures: input.apiFeatures ?? null,
    apiKeys: normalizeApiKeys(input.apiKeys),
    authConfig: input.authConfig ?? null,
    defaultChatEndpoint: input.defaultChatEndpoint ?? null,
    endpointConfigs: withInferredAdapterFamilies(input.endpointConfigs),
    // New providers always start disabled — enableProviderWhenModelsAvailable flips this
    // once a flow (connection check, model pull) confirms usable models exist.
    isEnabled: false,
    name: input.name,
    presetProviderId: input.presetProviderId ?? null,
    providerId: input.providerId,
    providerSettings: input.providerSettings ?? null,
  };
}

export class ProviderService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get cacheService() {
    return application.get('CacheService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async list(query: { enabled?: boolean } = {}): Promise<Provider[]> {
    const rows =
      query.enabled === undefined
        ? await this.db.select().from(userProviderTable).orderBy(asc(userProviderTable.orderKey))
        : await this.db
            .select()
            .from(userProviderTable)
            .where(eq(userProviderTable.isEnabled, query.enabled))
            .orderBy(asc(userProviderTable.orderKey));

    return rows.filter(isMobileSupportedProviderRow).map(rowToProvider);
  }

  async listPage(query: ProviderListPageQuery = {}): Promise<CursorPaginationResponse<Provider>> {
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_PROVIDER_PAGE_LIMIT, 1),
      MAX_PROVIDER_PAGE_LIMIT,
    );
    const cursor = decodeProviderCursor(query.cursor);
    const excludedProviderIds = [...providerRegistryService.getExcludedProviderIds()];
    const conditions: SQL[] = [];

    if (excludedProviderIds.length > 0) {
      conditions.push(
        or(
          isNull(userProviderTable.presetProviderId),
          notInArray(userProviderTable.presetProviderId, excludedProviderIds),
        )!,
      );
    }
    if (cursor) {
      conditions.push(afterProviderCursor(cursor));
    }

    const rows = await this.db
      .select()
      .from(userProviderTable)
      .where(and(...conditions))
      .orderBy(
        desc(userProviderTable.isEnabled),
        asc(userProviderTable.orderKey),
        asc(userProviderTable.providerId),
      )
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);

    return {
      items: pageRows.map(rowToProvider),
      ...(rows.length > limit && last
        ? {
            nextCursor: encodeProviderCursor({
              isEnabled: last.isEnabled,
              orderKey: last.orderKey,
              providerId: last.providerId,
            }),
          }
        : {}),
    };
  }

  async getByProviderId(providerId: string): Promise<Provider> {
    const [row] = await this.db
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, providerId))
      .limit(1);

    if (!row || !isMobileSupportedProviderRow(row)) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    return rowToProvider(row);
  }

  async getRowByProviderId(providerId: string): Promise<UserProviderRow | null> {
    const [row] = await this.db
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, providerId))
      .limit(1);
    return row ?? null;
  }

  async listApiKeys(
    providerId: string,
    query: ListProviderApiKeysQuery = {},
  ): Promise<{ keys: ApiKeyEntry[] }> {
    const row = await this.getRowByProviderId(providerId);

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    const keys = row.apiKeys ?? [];

    return {
      keys: query.enabled ? keys.filter((entry) => entry.isEnabled) : keys,
    };
  }

  async getAuthConfig(providerId: string): Promise<AuthConfig | null> {
    const row = await this.getRowByProviderId(providerId);

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    return row.authConfig ?? null;
  }

  /** Select a serving key and capture its non-secret identity atomically. */
  async resolveApiKey(providerId: string, override?: string): Promise<ResolvedProviderApiKey> {
    const row = await this.getRowByProviderId(providerId);

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    const allKeys = row.apiKeys ?? [];
    if (override !== undefined) {
      const matched = allKeys.find((entry) => entry.key === override);
      return matched ? resolvedApiKey(override, 'matched', matched) : unknownApiKey(override);
    }

    const enabledKeys = allKeys.filter((key) => key.isEnabled);

    if (enabledKeys.length === 0) {
      return unknownApiKey('');
    }

    if (enabledKeys.length === 1) {
      return resolvedApiKey(enabledKeys[0].key, 'explicit', enabledKeys[0]);
    }

    const cacheKey = apiKeyRotationCacheKey(providerId);
    const lastUsedKeyId = this.cacheService.get(cacheKey);

    if (!lastUsedKeyId) {
      this.cacheService.set(cacheKey, enabledKeys[0].id);
      return resolvedApiKey(enabledKeys[0].key, 'explicit', enabledKeys[0]);
    }

    const currentIndex = enabledKeys.findIndex((key) => key.id === lastUsedKeyId);
    const nextIndex = (currentIndex + 1) % enabledKeys.length;
    const nextKey = enabledKeys[nextIndex];
    this.cacheService.set(cacheKey, nextKey.id);

    return resolvedApiKey(nextKey.key, 'explicit', nextKey);
  }

  /** Get only the selected key value for callers that do not persist usage. */
  async getRotatedApiKey(providerId: string): Promise<string> {
    return (await this.resolveApiKey(providerId)).value;
  }

  async create(input: CreateProviderInput): Promise<Provider> {
    const row = (await this.dbService.withWriteTx((tx) =>
      insertWithOrderKey(tx, userProviderTable, toInsert(input), {
        pkColumn: userProviderTable.providerId,
      }),
    )) as UserProviderRow;

    return rowToProvider(row);
  }

  async update(providerId: string, input: UpdateProviderInput): Promise<Provider> {
    const updates: Partial<InsertUserProviderRow> = {};

    if (input.apiFeatures !== undefined) {
      updates.apiFeatures = input.apiFeatures;
    }
    if (input.authConfig !== undefined) {
      updates.authConfig = input.authConfig;
    }
    if (input.defaultChatEndpoint !== undefined) {
      updates.defaultChatEndpoint = input.defaultChatEndpoint;
    }
    if (input.endpointConfigs !== undefined) {
      updates.endpointConfigs = withInferredAdapterFamilies(input.endpointConfigs) as Partial<
        Record<string, EndpointConfig>
      > | null;
    }
    if (input.isEnabled !== undefined) {
      updates.isEnabled = input.isEnabled;
    }
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    const [row] = await this.dbService.withWriteTx(async (tx) => {
      if (input.providerSettings !== undefined) {
        if (input.providerSettings === null) {
          updates.providerSettings = null;
        } else {
          const [current] = await tx
            .select({ providerSettings: userProviderTable.providerSettings })
            .from(userProviderTable)
            .where(eq(userProviderTable.providerId, providerId))
            .limit(1);

          if (!current) {
            throw DataApiErrorFactory.notFound('Provider', providerId);
          }

          updates.providerSettings = {
            ...(current.providerSettings as Partial<ProviderSettings> | null),
            ...input.providerSettings,
          };
        }
      }

      return tx
        .update(userProviderTable)
        .set(updates)
        .where(eq(userProviderTable.providerId, providerId))
        .returning();
    });

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    return rowToProvider(row);
  }

  async replaceApiKeys(providerId: string, apiKeys: ApiKeyEntry[]): Promise<Provider> {
    const normalizedApiKeys = normalizeApiKeys(apiKeys);
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .update(userProviderTable)
        .set({ apiKeys: normalizedApiKeys })
        .where(eq(userProviderTable.providerId, providerId))
        .returning(),
    );

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    return rowToProvider(row);
  }

  async updateApiKey(
    providerId: string,
    keyId: string,
    updates: UpdateApiKeyInput,
  ): Promise<Provider> {
    const row = await this.getRowByProviderId(providerId);

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    const keys = row.apiKeys ?? [];
    const existingKey = keys.find((entry) => entry.id === keyId);

    if (!existingKey) {
      throw DataApiErrorFactory.notFound('API key', keyId);
    }

    const nextKeys = keys.map((entry) =>
      entry.id === keyId
        ? {
            ...entry,
            ...(updates.key !== undefined ? { key: updates.key } : {}),
            ...(updates.label !== undefined ? { label: updates.label } : {}),
            ...(updates.isEnabled !== undefined ? { isEnabled: updates.isEnabled } : {}),
          }
        : entry,
    );

    return this.replaceApiKeys(providerId, nextKeys);
  }

  async delete(providerId: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const providerModelIds = tx
        .select({ id: userModelTable.id })
        .from(userModelTable)
        .where(eq(userModelTable.providerId, providerId));
      await tx
        .update(agentTable)
        .set({ updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt) })
        .where(inArray(agentTable.modelId, providerModelIds));

      const deletedProviders = await tx
        .delete(userProviderTable)
        .where(eq(userProviderTable.providerId, providerId))
        .returning({ providerId: userProviderTable.providerId });

      if (deletedProviders.length === 0) {
        throw DataApiErrorFactory.notFound('Provider', providerId);
      }
    });

    this.cacheService.delete(apiKeyRotationCacheKey(providerId));
  }

  async batchUpsert(inputs: CreateProviderInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    await this.dbService.withWriteTx(async (tx) => {
      const providerIds = inputs.map((input) => input.providerId);
      const existingRows = await tx
        .select({
          apiFeatures: userProviderTable.apiFeatures,
          defaultChatEndpoint: userProviderTable.defaultChatEndpoint,
          endpointConfigs: userProviderTable.endpointConfigs,
          providerId: userProviderTable.providerId,
          presetProviderId: userProviderTable.presetProviderId,
        })
        .from(userProviderTable)
        .where(inArray(userProviderTable.providerId, providerIds));
      const existing = new Set(existingRows.map((row) => row.providerId));
      const newRows = inputs.flatMap((input) =>
        existing.has(input.providerId) ? [] : [toInsert(input)],
      );

      if (newRows.length > 0) {
        await insertManyWithOrderKey(tx, userProviderTable, newRows, {
          pkColumn: userProviderTable.providerId,
        });
      }

      const inputByProviderId = new Map(inputs.map((input) => [input.providerId, input]));
      for (const row of existingRows) {
        const input = inputByProviderId.get(row.providerId);
        if (!input || row.presetProviderId === null) {
          continue;
        }

        // react-doctor-disable-next-line async-await-in-loop -- 同一写事务内本质串行，并行化无收益
        await tx
          .update(userProviderTable)
          .set({
            apiFeatures: mergeApiFeatures(row.apiFeatures, input.apiFeatures ?? null),
            defaultChatEndpoint: row.defaultChatEndpoint ?? input.defaultChatEndpoint ?? null,
            endpointConfigs: mergeCatalogEndpointConfigs(
              row.endpointConfigs as EndpointConfigs | null,
              input.endpointConfigs,
            ) as Partial<Record<string, EndpointConfig>> | null,
          })
          .where(eq(userProviderTable.providerId, row.providerId));
      }
    });
  }
}

export const providerService = new ProviderService();

function apiKeyRotationCacheKey(providerId: string) {
  return `settings.provider.${providerId}.last_used_key_id` as const;
}
