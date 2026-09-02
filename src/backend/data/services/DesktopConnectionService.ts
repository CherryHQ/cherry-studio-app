import { inferAdapterFamily } from '@cherrystudio/provider-registry';
import { asc, eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import * as z from 'zod';

import { application } from '@/backend/core/application/Application';
import {
  desktopConnectionTable,
  type DesktopConnectionRow,
  type InsertUserProviderRow,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import { DataApiError, DataApiErrorFactory, ErrorCode } from '@/shared/data/api/errors';
import {
  type DesktopImportPreview,
  type DesktopImportResult,
  type DesktopImportSelectionsDto,
  type DesktopImportUnavailableReason,
  DesktopImportSelectionsSchema,
  type DesktopPairingQr,
  type DesktopProviderModel,
  type DesktopProviderSnapshot,
  DesktopProvidersSnapshotSchema,
  type PairDesktopConnectionDto,
  PairDesktopConnectionSchema,
  parseSupportedAuthConfig,
} from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';
import { createUniqueModelId, ENDPOINT_TYPE, type EndpointType } from '@/shared/data/types/model';
import type { EndpointConfig, EndpointConfigs } from '@/shared/data/types/provider';

import { buildModelInsertValues, type CreateModelInput } from './ModelService';
import { providerRegistryService } from './ProviderRegistryService';
import { insertManyWithOrderKey, insertWithOrderKey } from './utils/orderKey';

const REQUEST_TIMEOUT_MS = 4_000;
const TOKEN_KEY_PREFIX = 'desktop-connection-token.';
const TOKEN_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const PairResponseSchema = z.looseObject({
  name: z.string().min(1),
  token: z.string().min(1),
  version: z.string(),
});

class PairingRejectedError extends Error {}
class AuthorizationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(`Desktop authorization failed with status ${status}`);
  }
}

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

function tokenKey(connectionId: string): string {
  return `${TOKEN_KEY_PREFIX}${connectionId}`;
}

function baseUrlsFromQr(qr: DesktopPairingQr): string[] {
  return [...new Set(qr.ips.map((ip) => `http://${ip.includes(':') ? `[${ip}]` : ip}:${qr.port}`))];
}

async function requestWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await expoFetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function pairDesktop(baseUrls: string[], qr: DesktopPairingQr) {
  const reportedDeviceName = (Device.deviceName ?? Device.modelName ?? '').trim();
  const deviceName = (reportedDeviceName || 'Cherry Studio Mobile').slice(0, 64);
  for (const baseUrl of baseUrls) {
    try {
      const response = await requestWithTimeout(`${baseUrl}/pair`, {
        body: JSON.stringify({
          code: qr.code,
          device: { name: deviceName, platform: Platform.OS.slice(0, 32) },
        }),
        headers: { ...defaultAppHeaders(), 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (response.status === 403) {
        throw new PairingRejectedError();
      }
      if (!response.ok) {
        throw new Error(`Pairing request failed with status ${response.status}`);
      }

      const parsed = PairResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw desktopError('invalid-pair-response', 'Desktop returned an invalid pairing response');
      }
      return { baseUrl, ...parsed.data };
    } catch (error) {
      if (error instanceof PairingRejectedError || error instanceof DataApiError) {
        throw error;
      }
    }
  }

  throw desktopError('unreachable', 'Could not connect to the desktop');
}

async function fetchSnapshot(baseUrls: string[], token: string) {
  for (const baseUrl of baseUrls) {
    try {
      const response = await requestWithTimeout(`${baseUrl}/v1/export/providers`, {
        headers: { ...defaultAppHeaders(), Authorization: `Bearer ${token}` },
        method: 'GET',
      });
      if (response.status === 401 || response.status === 403) {
        throw new AuthorizationError(response.status);
      }
      if (!response.ok) {
        throw new Error(`Desktop configuration request failed with status ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw desktopError('invalid-snapshot', 'Desktop returned invalid configuration data');
      }
      return { baseUrl, payload };
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof DataApiError) {
        throw error;
      }
    }
  }

  throw desktopError('unreachable', 'Could not fetch configuration from the desktop');
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
  presetProviderId: string | null,
) {
  const registryProviderId = presetProviderId ?? provider.id;
  const registryContext = {
    defaultChatEndpoint:
      provider.defaultChatEndpoint ??
      (provider.apiHost ? endpointFromProviderType(provider.type) : undefined),
    presetProviderId,
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
  return buildModelInsertValues(input);
}

export class DesktopConnectionService {
  private get dbService() {
    return application.get('DbService');
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

  async pair(input: PairDesktopConnectionDto): Promise<DesktopConnection> {
    const qr = PairDesktopConnectionSchema.parse(input);
    const baseUrls = baseUrlsFromQr(qr);
    let paired: Awaited<ReturnType<typeof pairDesktop>>;
    try {
      paired = await pairDesktop(baseUrls, qr);
    } catch (error) {
      if (error instanceof PairingRejectedError) {
        throw desktopError('pairing-rejected', 'The pairing code is invalid or expired');
      }
      throw error;
    }

    const connectionId = qr.connectionId ?? Crypto.randomUUID();
    const key = tokenKey(connectionId);
    const previousToken = qr.connectionId ? await SecureStore.getItemAsync(key) : null;
    if (qr.connectionId) {
      await this.getRow(qr.connectionId);
    }

    await SecureStore.setItemAsync(key, paired.token, TOKEN_STORE_OPTIONS);
    try {
      const [row] = await this.dbService.withWriteTx((tx) =>
        qr.connectionId
          ? tx
              .update(desktopConnectionTable)
              .set({
                activeBaseUrl: paired.baseUrl,
                baseUrls,
                desktopVersion: paired.version,
                name: paired.name,
                status: 'paired',
              })
              .where(eq(desktopConnectionTable.id, connectionId))
              .returning()
          : tx
              .insert(desktopConnectionTable)
              .values({
                activeBaseUrl: paired.baseUrl,
                baseUrls,
                desktopVersion: paired.version,
                id: connectionId,
                name: paired.name,
                status: 'paired',
              })
              .returning(),
      );
      if (!row) {
        throw DataApiErrorFactory.notFound('DesktopConnection', connectionId);
      }
      return rowToConnection(row);
    } catch (error) {
      if (previousToken) {
        await SecureStore.setItemAsync(key, previousToken, TOKEN_STORE_OPTIONS);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.dbService.withWriteTx((tx) =>
      tx
        .delete(desktopConnectionTable)
        .where(eq(desktopConnectionTable.id, id))
        .returning({ id: desktopConnectionTable.id }),
    );
    if (!deleted) {
      throw DataApiErrorFactory.notFound('DesktopConnection', id);
    }
    await SecureStore.deleteItemAsync(tokenKey(id));
  }

  async preview(id: string): Promise<DesktopImportPreview> {
    const snapshot = await this.loadSnapshot(id);
    if (snapshot.providers.length === 0) {
      return { providers: [] };
    }

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
          action: existingProviders.has(provider.id) ? 'update' : 'add',
          id: provider.id,
          models: provider.models.map((model) => ({
            action: existingModels.has(createUniqueModelId(provider.id, model.modelId))
              ? 'update'
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

  async import(id: string, input: DesktopImportSelectionsDto): Promise<DesktopImportResult> {
    const { selections } = DesktopImportSelectionsSchema.parse(input);
    const selectedModes = new Map(selections.map((item) => [item.providerId, item.mode]));
    if (selectedModes.size !== selections.length) {
      throw desktopError('invalid-selection', 'A provider can only be selected once');
    }

    const snapshot = await this.loadSnapshot(id);
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
      const result: DesktopImportResult = {
        modelsAdded: 0,
        modelsUpdated: 0,
        providersAdded: 0,
        providersUpdated: 0,
      };

      for (const [providerId, mode] of selectedModes) {
        const provider = providersById.get(providerId)!;
        const providerValues = mapProvider(provider);
        const [existingProvider] = await tx
          .select({ id: userProviderTable.providerId })
          .from(userProviderTable)
          .where(eq(userProviderTable.providerId, providerId))
          .limit(1);

        if (existingProvider) {
          const { providerId: _providerId, ...updates } = providerValues;
          await tx
            .update(userProviderTable)
            .set(updates)
            .where(eq(userProviderTable.providerId, providerId));
          result.providersUpdated += 1;
        } else {
          await insertWithOrderKey(tx, userProviderTable, providerValues, {
            pkColumn: userProviderTable.providerId,
          });
          result.providersAdded += 1;
        }

        if (mode !== 'provider-models') {
          continue;
        }

        const modelValues = provider.models.map((model) =>
          mapModel(provider, model, providerValues.presetProviderId ?? null),
        );
        const existingModelIds = new Set(
          (
            await tx
              .select({ id: userModelTable.id })
              .from(userModelTable)
              .where(eq(userModelTable.providerId, providerId))
          ).map((row) => row.id),
        );
        const newModels = modelValues.filter((model) => !existingModelIds.has(model.id));
        if (newModels.length > 0) {
          await insertManyWithOrderKey(tx, userModelTable, newModels, {
            pkColumn: userModelTable.id,
            scope: eq(userModelTable.providerId, providerId),
          });
          result.modelsAdded += newModels.length;
        }

        for (const model of modelValues) {
          if (!existingModelIds.has(model.id)) {
            continue;
          }
          const { id: _id, modelId: _modelId, providerId: _modelProviderId, ...updates } = model;
          await tx.update(userModelTable).set(updates).where(eq(userModelTable.id, model.id));
          result.modelsUpdated += 1;
        }
      }

      const [connection] = await tx
        .update(desktopConnectionTable)
        .set({ lastFetchedAt: Date.now(), status: 'paired' })
        .where(eq(desktopConnectionTable.id, id))
        .returning({ id: desktopConnectionTable.id });
      if (!connection) {
        throw DataApiErrorFactory.notFound('DesktopConnection', id);
      }
      return result;
    });
  }

  private async getRow(id: string): Promise<DesktopConnectionRow> {
    const [row] = await this.db
      .select()
      .from(desktopConnectionTable)
      .where(eq(desktopConnectionTable.id, id))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('DesktopConnection', id);
    }
    return row;
  }

  private async loadSnapshot(id: string) {
    const connection = await this.getRow(id);
    const token = await SecureStore.getItemAsync(tokenKey(id));
    if (!token) {
      await this.markNeedsRepair(id);
      throw desktopError('auth-revoked', 'This desktop connection needs to be paired again');
    }

    const candidateUrls = [
      connection.activeBaseUrl,
      ...connection.baseUrls.filter((url) => url !== connection.activeBaseUrl),
    ];
    let response: Awaited<ReturnType<typeof fetchSnapshot>>;
    try {
      response = await fetchSnapshot(candidateUrls, token);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        if (error.status === 403) {
          await this.markNeedsRepair(id);
          throw desktopError('auth-revoked', 'This desktop connection needs to be paired again');
        }
        throw desktopError('unauthorized', 'The desktop rejected this device token');
      }
      throw error;
    }

    const version =
      typeof response.payload === 'object' && response.payload !== null
        ? (response.payload as Record<string, unknown>).version
        : undefined;
    if (version !== 1) {
      if (typeof version === 'number') {
        throw desktopError(
          'unsupported-version',
          'The desktop uses an unsupported protocol version',
        );
      }
      throw desktopError('invalid-snapshot', 'Desktop returned invalid configuration data');
    }

    const parsed = DesktopProvidersSnapshotSchema.safeParse(response.payload);
    if (!parsed.success) {
      throw desktopError('invalid-snapshot', 'Desktop returned invalid configuration data');
    }
    await this.dbService.withWriteTx((tx) =>
      tx
        .update(desktopConnectionTable)
        .set({
          activeBaseUrl: response.baseUrl,
          lastFetchedAt: Date.now(),
          status: 'paired',
        })
        .where(eq(desktopConnectionTable.id, id)),
    );
    return parsed.data;
  }

  private async markNeedsRepair(id: string): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      tx
        .update(desktopConnectionTable)
        .set({ status: 'needs-repair' })
        .where(eq(desktopConnectionTable.id, id)),
    );
  }
}

export const desktopConnectionService = new DesktopConnectionService();
