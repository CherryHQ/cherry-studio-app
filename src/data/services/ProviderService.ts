import { inferAdapterFamily } from '@cherrystudio/provider-registry';
import { asc, eq, inArray } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import type { DbService } from '@/data/db/DbService';
import type { UserProviderInsert, UserProviderSelect } from '@/data/db/schema/userProvider';
import { userProviderTable } from '@/data/db/schema/userProvider';
import { DataApiErrorFactory } from '@/data/types/apiTypes';
import type { EndpointType } from '@/data/types/model';
import type {
  ApiKeyEntry,
  AuthConfig,
  AuthType,
  EndpointConfig,
  EndpointConfigs,
  Provider,
  ProviderSettings,
  RuntimeApiFeatures,
} from '@/data/types/provider';
import {
  DEFAULT_API_FEATURES as DEFAULT_FEATURES,
  DEFAULT_PROVIDER_SETTINGS,
} from '@/data/types/provider';

import { providerRegistryService } from './providerRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

export type CreateProviderInput = {
  apiFeatures?: UserProviderInsert['apiFeatures'];
  apiKeys?: ApiKeyEntry[];
  authConfig?: UserProviderInsert['authConfig'];
  defaultChatEndpoint?: UserProviderInsert['defaultChatEndpoint'];
  endpointConfigs?: EndpointConfigs | null;
  isEnabled?: boolean;
  name: string;
  presetProviderId?: string | null;
  providerId: string;
  providerSettings?: ProviderSettings | null;
};

type ProviderInputWithoutOrderKey = Omit<UserProviderInsert, 'orderKey'>;
export type UpdateProviderInput = {
  apiFeatures?: Partial<RuntimeApiFeatures> | null;
  authConfig?: AuthConfig | null;
  defaultChatEndpoint?: UserProviderInsert['defaultChatEndpoint'] | null;
  endpointConfigs?: EndpointConfigs | null;
  isEnabled?: boolean;
  name?: string;
  providerSettings?: ProviderSettings | null;
};

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
  existing: UserProviderInsert['apiFeatures'],
  catalog: UserProviderInsert['apiFeatures'],
): UserProviderInsert['apiFeatures'] {
  if (!existing && !catalog) {
    return null;
  }

  return {
    ...(catalog ?? {}),
    ...(existing ?? {}),
  } as UserProviderInsert['apiFeatures'];
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

function rowToProvider(row: UserProviderSelect): Provider {
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
    authType,
    defaultChatEndpoint: row.defaultChatEndpoint ?? undefined,
    description: metadata.description,
    endpointConfigs: row.endpointConfigs as EndpointConfigs | undefined,
    id: row.providerId,
    isEnabled: row.isEnabled,
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
    isEnabled: input.isEnabled ?? true,
    name: input.name,
    presetProviderId: input.presetProviderId ?? null,
    providerId: input.providerId,
    providerSettings: input.providerSettings ?? null,
  };
}

export class ProviderService {
  private readonly lastUsedApiKeyIds = new Map<string, string>();

  constructor(private readonly dbService: DbService) {}

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

  async getRowByProviderId(providerId: string): Promise<UserProviderSelect | null> {
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

    // Round-robin using in-memory runtime state. Mobile keeps this scoped to
    // the active data service graph instead of the desktop CacheService.
    const lastUsedKeyId = this.lastUsedApiKeyIds.get(providerId);

    if (!lastUsedKeyId) {
      this.lastUsedApiKeyIds.set(providerId, enabledKeys[0].id);
      return enabledKeys[0].key;
    }

    const currentIndex = enabledKeys.findIndex((key) => key.id === lastUsedKeyId);
    const nextIndex = (currentIndex + 1) % enabledKeys.length;
    const nextKey = enabledKeys[nextIndex];
    this.lastUsedApiKeyIds.set(providerId, nextKey.id);

    return nextKey.key;
  }

  async create(input: CreateProviderInput): Promise<Provider> {
    const row = (await this.dbService.withWriteTx((tx) =>
      insertWithOrderKey(tx, userProviderTable, toInsert(input), {
        pkColumn: userProviderTable.providerId,
      }),
    )) as UserProviderSelect;

    return rowToProvider(row);
  }

  async update(providerId: string, input: UpdateProviderInput): Promise<Provider> {
    const updates: Partial<UserProviderInsert> = {};

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
    if (input.providerSettings !== undefined) {
      updates.providerSettings = input.providerSettings;
    }

    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .update(userProviderTable)
        .set(updates)
        .where(eq(userProviderTable.providerId, providerId))
        .returning(),
    );

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
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .delete(userProviderTable)
        .where(eq(userProviderTable.providerId, providerId))
        .returning({ providerId: userProviderTable.providerId }),
    );

    if (!row) {
      throw DataApiErrorFactory.notFound('Provider', providerId);
    }
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
      const newRows = inputs.filter((input) => !existing.has(input.providerId)).map(toInsert);

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
