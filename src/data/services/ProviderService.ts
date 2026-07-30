import { inferAdapterFamily } from '@cherrystudio/provider-registry';
import { asc, eq, inArray } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import type { CacheService } from '@/data/cache';
import type { DbService } from '@/data/db/DbService';
import { userModelTable } from '@/data/db/schemas/userModel';
import type { InsertUserProviderRow, UserProviderRow } from '@/data/db/schemas/userProvider';
import { userProviderTable } from '@/data/db/schemas/userProvider';
import { DataApiErrorFactory } from '@/shared/data/api/types';
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

import type { PinService } from './PinService';
import { providerRegistryService } from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

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

export function canDeleteProvider(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean {
  return (
    provider.presetProviderId !== provider.id &&
    !providerRegistryService.isRegistryProvider(provider.id)
  );
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

function mergeCatalogApiFeatures(
  existing: InsertUserProviderRow['apiFeatures'],
  catalog: InsertUserProviderRow['apiFeatures'],
): InsertUserProviderRow['apiFeatures'] {
  if (!existing && !catalog) {
    return null;
  }

  return {
    ...(catalog ?? {}),
    ...(existing ?? {}),
  } as InsertUserProviderRow['apiFeatures'];
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
      ...row.apiFeatures,
    },
    apiKeys,
    authMethods: metadata.authMethods,
    authOptional: metadata.authOptional,
    authType,
    defaultChatEndpoint: row.defaultChatEndpoint ?? undefined,
    description: metadata.description,
    endpointConfigs: row.endpointConfigs as EndpointConfigs | undefined,
    id: row.providerId,
    isEnabled: row.isEnabled,
    modelListSource: metadata.modelListSource,
    name: row.name,
    presetProviderId: row.presetProviderId ?? undefined,
    settings: {
      ...DEFAULT_PROVIDER_SETTINGS,
      ...(row.providerSettings as Partial<ProviderSettings> | null),
    },
    websites: metadata.websites,
  };
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
  constructor(
    private readonly dbService: DbService,
    private readonly pinService: PinService,
    private readonly cacheService: CacheService,
  ) {}

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

    return rows.map(rowToProvider);
  }

  async getByProviderId(providerId: string): Promise<Provider> {
    const [row] = await this.db
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, providerId))
      .limit(1);

    if (!row) {
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

  /**
   * Get a rotated API key for a provider (round-robin across enabled keys).
   * Returns empty string for providers that don't have keys.
   */
  async getRotatedApiKey(providerId: string): Promise<string> {
    const row = await this.getRowByProviderId(providerId);

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }

    const enabledKeys = (row.apiKeys ?? []).filter((key) => key.isEnabled);

    if (enabledKeys.length === 0) {
      return '';
    }

    if (enabledKeys.length === 1) {
      return enabledKeys[0].key;
    }

    // Round-robin via the CacheService memory tier, same key as the desktop
    // main-process ProviderService. The schema default is '' so a fresh
    // provider falls into the falsy branch.
    const cacheKey = `settings.provider.${providerId}.last_used_key_id` as const;
    const lastUsedKeyId = this.cacheService.get(cacheKey);

    if (!lastUsedKeyId) {
      this.cacheService.set(cacheKey, enabledKeys[0].id);
      return enabledKeys[0].key;
    }

    const currentIndex = enabledKeys.findIndex((key) => key.id === lastUsedKeyId);
    const nextIndex = (currentIndex + 1) % enabledKeys.length;
    const nextKey = enabledKeys[nextIndex];
    this.cacheService.set(cacheKey, nextKey.id);

    return nextKey.key;
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
      const [provider] = await tx
        .select({ presetProviderId: userProviderTable.presetProviderId })
        .from(userProviderTable)
        .where(eq(userProviderTable.providerId, providerId))
        .limit(1);

      if (!provider) {
        throw DataApiErrorFactory.notFound('Provider', providerId);
      }

      if (
        !canDeleteProvider({
          id: providerId,
          presetProviderId: provider.presetProviderId ?? undefined,
        })
      ) {
        throw DataApiErrorFactory.invalidOperation(`Cannot delete preset provider '${providerId}'`);
      }

      const models = await tx
        .select({ id: userModelTable.id })
        .from(userModelTable)
        .where(eq(userModelTable.providerId, providerId));

      await this.pinService.purgeForEntitiesTx(
        tx,
        'model',
        models.map((model) => model.id),
      );

      const deletedProviders = await tx
        .delete(userProviderTable)
        .where(eq(userProviderTable.providerId, providerId))
        .returning({ providerId: userProviderTable.providerId });

      if (deletedProviders.length === 0) {
        throw DataApiErrorFactory.notFound('Provider', providerId);
      }
    });

    this.cacheService.delete(`settings.provider.${providerId}.last_used_key_id` as const);
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
            apiFeatures: mergeCatalogApiFeatures(row.apiFeatures, input.apiFeatures ?? null),
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
