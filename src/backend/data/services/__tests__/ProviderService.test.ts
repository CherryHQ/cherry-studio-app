import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';
import type { DbService } from '@/backend/data/db/DbService';
import type { UserProviderRow } from '@/backend/data/db/schemas/userProvider';
import type { ApiKeyEntry, ProviderSettings } from '@/shared/data/types/provider';

import { providerRegistryService } from '../ProviderRegistryService';
import { ProviderService } from '../ProviderService';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));
jest.mock('../utils/orderKey', () => ({
  insertManyWithOrderKey: jest.fn(),
  insertWithOrderKey: jest.fn(),
}));
jest.mock('../ProviderRegistryService', () => ({
  providerRegistryService: {
    getProviderDisplayMetadata: jest.fn(() => ({})),
    getExcludedProviderIds: jest.fn(() => []),
    isProviderExcluded: jest.fn(() => false),
  },
}));

afterEach(uninstallTestHost);

describe('ProviderService', () => {
  test('projects unsupported preset providers out while retaining custom providers', async () => {
    const rows = [
      createProviderRow(
        {},
        { name: 'OpenRouter', presetProviderId: 'openrouter', providerId: 'openrouter' },
      ),
      createProviderRow(
        {},
        { name: 'OpenAI Codex', presetProviderId: 'openai-codex', providerId: 'openai-codex' },
      ),
      createProviderRow(
        {},
        { name: 'Grok CLI', presetProviderId: 'grok-cli', providerId: 'grok-cli' },
      ),
      createProviderRow({}, { name: 'Gemini', presetProviderId: 'gemini', providerId: 'gemini' }),
      createProviderRow({}, { name: 'Custom provider', providerId: 'custom-provider' }),
    ];
    jest
      .mocked(providerRegistryService.isProviderExcluded)
      .mockImplementation((providerId) => ['grok-cli', 'openai-codex'].includes(providerId));
    const service = await createReadService({
      select: () => ({
        from: () => ({ orderBy: async () => rows }),
      }),
    });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({ id: 'openrouter' }),
      expect.objectContaining({ id: 'gemini' }),
      expect.objectContaining({ id: 'custom-provider' }),
    ]);
    expect(rows.map((row) => row.providerId)).toEqual([
      'openrouter',
      'openai-codex',
      'grok-cli',
      'gemini',
      'custom-provider',
    ]);
  });

  test('blocks direct access to a retained unsupported preset provider row', async () => {
    const row = createProviderRow(
      {},
      { name: 'OpenAI Codex', presetProviderId: 'openai-codex', providerId: 'openai-codex' },
    );
    jest.mocked(providerRegistryService.isProviderExcluded).mockReturnValue(true);
    const service = await createReadService({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [row] }) }),
      }),
    });

    await expect(service.getByProviderId(row.providerId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.getRowByProviderId(row.providerId)).resolves.toBe(row);
  });

  test('includes registry API feature baselines in runtime providers', async () => {
    jest.mocked(providerRegistryService.getProviderDisplayMetadata).mockReturnValueOnce({
      apiFeatures: {
        arrayContent: true,
        reportsActualCost: true,
        serviceTier: false,
        streamOptions: true,
        verbosity: false,
      },
    });
    const row = createProviderRow({});
    const service = await createReadService({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [row] }) }),
      }),
    });

    await expect(service.getByProviderId(row.providerId)).resolves.toMatchObject({
      apiFeatures: { reportsActualCost: true },
    });
  });

  test('drops removed API features from legacy provider rows', async () => {
    const row = createProviderRow(
      {},
      {
        apiFeatures: {
          developerRole: true,
          reportsActualCost: true,
        } as unknown as UserProviderRow['apiFeatures'],
      },
    );
    const service = await createReadService({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [row] }) }),
      }),
    });

    const provider = await service.getByProviderId(row.providerId);

    expect(provider.apiFeatures.reportsActualCost).toBe(true);
    expect('developerRole' in provider.apiFeatures).toBe(false);
  });

  test('preserves unknown stored provider settings when applying a patch', async () => {
    const storedSettings = {
      futureDesktopSetting: { enabled: true },
      notes: 'keep me',
    } as unknown as ProviderSettings;
    const row = createProviderRow(storedSettings);
    let writtenSettings: UserProviderRow['providerSettings'] = null;

    const tx = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(async () => [{ providerSettings: storedSettings }]),
          })),
        })),
      })),
      update: jest.fn(() => ({
        set: jest.fn((updates: Partial<UserProviderRow>) => {
          writtenSettings = updates.providerSettings ?? null;
          return {
            where: jest.fn(() => ({
              returning: jest.fn(async () => [{ ...row, ...updates }]),
            })),
          };
        }),
      })),
    };
    const service = await createService(tx);

    const provider = await service.update(row.providerId, {
      providerSettings: { serviceTier: null, timeout: 30_000, verbosity: null },
    });

    expect(writtenSettings).toEqual({
      futureDesktopSetting: { enabled: true },
      notes: 'keep me',
      serviceTier: null,
      timeout: 30_000,
      verbosity: null,
    });
    expect(provider.settings).toMatchObject({
      futureDesktopSetting: { enabled: true },
      notes: 'keep me',
      serviceTier: null,
      timeout: 30_000,
      verbosity: null,
    });
  });

  test('deletes a custom provider', async () => {
    const tx = createDeleteTransaction({
      providerId: 'custom-provider',
    });
    const service = await createService(tx);

    await service.delete('custom-provider');

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.delete.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  test('allows deleting a user clone of a registry provider', async () => {
    const tx = createDeleteTransaction({
      providerId: 'openai-clone',
    });
    const service = await createService(tx);

    await expect(service.delete('openai-clone')).resolves.toBeUndefined();
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });

  test('rotates enabled API keys round-robin', async () => {
    const service = await createRotationService([
      apiKey('a', 'key-a'),
      apiKey('b', 'key-b', false),
      apiKey('c', 'key-c'),
    ]);

    await expect(service.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
    await expect(service.getRotatedApiKey('custom-provider')).resolves.toBe('key-c');
    await expect(service.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
  });

  test('returns the selected key with a non-secret identity receipt', async () => {
    const service = await createRotationService([
      {
        id: 'primary',
        isEnabled: true,
        key: 'sk-abcdefghijklmnopqrstuvwxyz-123456',
        label: 'Main',
      },
    ]);

    const resolved = await service.resolveApiKey('custom-provider');

    expect(resolved.value).toBe('sk-abcdefghijklmnopqrstuvwxyz-123456');
    expect(resolved.apiKeySelection).toEqual({
      attribution: 'explicit',
      id: 'primary',
      label: 'Main',
      masked: 'sk-abcde****z-123456',
    });
    expect(JSON.stringify(resolved.apiKeySelection)).not.toContain(resolved.value);
  });

  test('matches overrides against every stored key without advancing rotation', async () => {
    const cacheService = createCacheService();
    const service = await createRotationService(
      [apiKey('enabled', 'enabled-key'), apiKey('disabled', 'disabled-key', false)],
      undefined,
      cacheService,
    );

    await expect(service.resolveApiKey('custom-provider', 'disabled-key')).resolves.toEqual({
      value: 'disabled-key',
      apiKeySelection: {
        attribution: 'matched',
        id: 'disabled',
        masked: 'di****ey',
      },
    });
    expect(cacheService.get('settings.provider.custom-provider.last_used_key_id')).toBeUndefined();
  });

  test('keeps unmatched overrides usable without persisting their identity', async () => {
    const service = await createRotationService([apiKey('primary', 'stored-key')]);

    const resolved = await service.resolveApiKey('custom-provider', 'caller-secret');

    expect(resolved).toEqual({
      value: 'caller-secret',
      apiKeySelection: { attribution: 'unknown' },
    });
    expect(JSON.stringify(resolved.apiKeySelection)).not.toContain('caller-secret');
  });

  test('never snapshots a raw short key and reports missing keys as unknown', async () => {
    await expect(
      (await createRotationService([apiKey('short', 'tiny')])).resolveApiKey('custom-provider'),
    ).resolves.toEqual({
      value: 'tiny',
      apiKeySelection: { attribution: 'explicit', id: 'short', masked: '****' },
    });
    await expect(
      (await createRotationService([])).resolveApiKey('custom-provider'),
    ).resolves.toEqual({
      value: '',
      apiKeySelection: { attribution: 'unknown' },
    });
  });

  test('short-circuits rotation for zero or one enabled key', async () => {
    await expect(
      (await createRotationService([apiKey('a', 'key-a', false)])).getRotatedApiKey(
        'custom-provider',
      ),
    ).resolves.toBe('');
    await expect(
      (await createRotationService([apiKey('a', 'key-a')])).getRotatedApiKey('custom-provider'),
    ).resolves.toBe('key-a');
  });

  test('rotation state is scoped per provider', async () => {
    const first = await createRotationService([apiKey('a', 'key-a'), apiKey('b', 'key-b')]);

    await expect(first.getRotatedApiKey('provider-one')).resolves.toBe('key-a');
    await expect(first.getRotatedApiKey('provider-two')).resolves.toBe('key-a');
    await expect(first.getRotatedApiKey('provider-one')).resolves.toBe('key-b');
  });

  test('shares rotation state through the backend cache', async () => {
    const cache = createCacheService();
    const keys = [apiKey('a', 'key-a'), apiKey('b', 'key-b')];

    await expect(
      (await createRotationService(keys, undefined, cache)).getRotatedApiKey('provider'),
    ).resolves.toBe('key-a');
    await expect(
      (await createRotationService(keys, undefined, cache)).getRotatedApiKey('provider'),
    ).resolves.toBe('key-b');
  });

  test('deleting a provider resets its rotation state', async () => {
    const tx = createDeleteTransaction({
      providerId: 'custom-provider',
    });
    const rotation = await createRotationService([apiKey('a', 'key-a'), apiKey('b', 'key-b')], tx);

    await expect(rotation.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
    await rotation.delete('custom-provider');

    await expect(rotation.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
  });

  test('deletes registry and canonical preset providers', async () => {
    const registryTx = createDeleteTransaction({
      providerId: 'openai',
    });
    await expect((await createService(registryTx)).delete('openai')).resolves.toBeUndefined();
    expect(registryTx.delete).toHaveBeenCalledTimes(1);

    const canonicalTx = createDeleteTransaction({
      providerId: 'canonical',
    });
    await expect((await createService(canonicalTx)).delete('canonical')).resolves.toBeUndefined();
    expect(canonicalTx.delete).toHaveBeenCalledTimes(1);
  });
});

/**
 * Service whose db serves `db` to the read paths; writes are not wired.
 *
 * `ProviderService` resolves `DbService` and `CacheService` per call, so this
 * helper and the ones below install the fakes as host overrides rather than
 * handing them to a constructor.
 */
async function createReadService(db: object): Promise<ProviderService> {
  await installTestHost({
    CacheService: createCacheService(),
    DbService: { getDb: () => db } as unknown as DbService,
  });
  return new ProviderService();
}

async function createService(tx: object): Promise<ProviderService> {
  await installTestHost({
    CacheService: createCacheService(),
    DbService: {
      getDb: () => ({}),
      withWriteTx: async (callback: (transaction: object) => Promise<unknown>) => callback(tx),
    } as unknown as DbService,
  });
  return new ProviderService();
}

function apiKey(id: string, key: string, isEnabled = true): ApiKeyEntry {
  return { id, isEnabled, key };
}

/** Service whose db always resolves one provider row with the given API keys. */
async function createRotationService(
  apiKeys: ApiKeyEntry[],
  writeTransaction?: object,
  cacheService = createCacheService(),
): Promise<ProviderService> {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => [{ apiKeys }]),
        })),
      })),
    })),
  };

  await installTestHost({
    CacheService: cacheService,
    DbService: {
      getDb: () => db,
      withWriteTx: async (callback: (transaction: object) => Promise<unknown>) =>
        callback(writeTransaction ?? {}),
    } as unknown as DbService,
  });
  return new ProviderService();
}

function createCacheService(): CacheService {
  const service = new CacheService(createInMemoryBackendCacheStorage());
  // Host overrides receive no lifecycle callbacks, so the cache is initialized
  // here. `CacheService.onInit` is synchronous, so it is usable as soon as
  // `_doInit()` has been called — which keeps this a plain function, usable as a
  // default parameter value. If that hook ever turns async, these tests fail
  // loudly on `CacheService is not initialized` rather than passing with a
  // half-built cache.
  void service._doInit();
  return service;
}

function createDeleteTransaction(input: { providerId: string }) {
  return {
    delete: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => [{ providerId: input.providerId }]),
      })),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({})),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    })),
  };
}

function createProviderRow(
  providerSettings: ProviderSettings,
  overrides: Partial<UserProviderRow> = {},
): UserProviderRow {
  return {
    apiFeatures: null,
    apiKeys: [],
    authConfig: null,
    createdAt: 1_767_225_600_000,
    defaultChatEndpoint: null,
    endpointConfigs: null,
    isEnabled: true,
    logoKey: null,
    name: 'Custom provider',
    orderKey: 'a0',
    presetProviderId: null,
    providerId: 'custom-provider',
    providerSettings,
    updatedAt: 1_767_225_600_000,
    ...overrides,
  };
}
