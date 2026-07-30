import type { DbService } from '@/backend/infrastructure/db/DbService';
import type { UserProviderRow } from '@/backend/infrastructure/db/schemas/userProvider';
import type { ApiKeyEntry, ProviderSettings } from '@/shared/data/types/provider';

import type { PinService } from '../PinService';
import { providerRegistryService } from '../ProviderRegistryService';
import { canDeleteProvider, ProviderService } from '../ProviderService';

jest.mock('uuid', () => ({ v7: jest.fn(() => '00000000-0000-7000-8000-000000000000') }));
jest.mock('../utils/orderKey', () => ({
  insertManyWithOrderKey: jest.fn(),
  insertWithOrderKey: jest.fn(),
}));
jest.mock('../ProviderRegistryService', () => ({
  providerRegistryService: {
    getProviderDisplayMetadata: jest.fn(() => ({})),
    isRegistryProvider: jest.fn(() => false),
  },
}));

describe('ProviderService', () => {
  test('only exposes deletion for custom providers and user-created preset clones', () => {
    expect(canDeleteProvider({ id: 'custom-provider' })).toBe(true);
    expect(canDeleteProvider({ id: 'openai-work', presetProviderId: 'openai' })).toBe(true);
    expect(canDeleteProvider({ id: 'openai', presetProviderId: 'openai' })).toBe(false);

    jest.mocked(providerRegistryService.isRegistryProvider).mockReturnValueOnce(true);
    expect(canDeleteProvider({ id: 'zai', presetProviderId: 'zhipu' })).toBe(false);
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
    const service = new ProviderService(
      {
        getDb: () => ({}),
        withWriteTx: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      } as unknown as DbService,
      createPinServiceStub(),
    );

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

  test('deletes a custom provider after purging pins for its models', async () => {
    const tx = createDeleteTransaction({
      modelIds: ['custom-provider::model-a', 'custom-provider::model-b'],
      presetProviderId: null,
      providerId: 'custom-provider',
    });
    const pinService = {
      purgeForEntitiesTx: jest.fn(async () => undefined),
    } as unknown as PinService;
    const service = createService(tx, pinService);

    await service.delete('custom-provider');

    expect(pinService.purgeForEntitiesTx).toHaveBeenCalledWith(tx, 'model', [
      'custom-provider::model-a',
      'custom-provider::model-b',
    ]);
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });

  test('allows deleting a user clone of a registry provider', async () => {
    const tx = createDeleteTransaction({
      modelIds: [],
      presetProviderId: 'openai',
      providerId: 'openai-clone',
    });
    const service = createService(tx);

    await expect(service.delete('openai-clone')).resolves.toBeUndefined();
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });

  test('rotates enabled API keys round-robin', async () => {
    const service = createRotationService([
      apiKey('a', 'key-a'),
      apiKey('b', 'key-b', false),
      apiKey('c', 'key-c'),
    ]);

    await expect(service.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
    await expect(service.getRotatedApiKey('custom-provider')).resolves.toBe('key-c');
    await expect(service.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
  });

  test('short-circuits rotation for zero or one enabled key', async () => {
    await expect(
      createRotationService([apiKey('a', 'key-a', false)]).getRotatedApiKey('custom-provider'),
    ).resolves.toBe('');
    await expect(
      createRotationService([apiKey('a', 'key-a')]).getRotatedApiKey('custom-provider'),
    ).resolves.toBe('key-a');
  });

  test('rotation state is scoped per provider', async () => {
    const first = createRotationService([apiKey('a', 'key-a'), apiKey('b', 'key-b')]);

    await expect(first.getRotatedApiKey('provider-one')).resolves.toBe('key-a');
    await expect(first.getRotatedApiKey('provider-two')).resolves.toBe('key-a');
    await expect(first.getRotatedApiKey('provider-one')).resolves.toBe('key-b');
  });

  test('deleting a provider resets its rotation state', async () => {
    const tx = createDeleteTransaction({
      modelIds: [],
      presetProviderId: null,
      providerId: 'custom-provider',
    });
    const rotation = createRotationService([apiKey('a', 'key-a'), apiKey('b', 'key-b')], tx);

    await expect(rotation.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
    await rotation.delete('custom-provider');

    await expect(rotation.getRotatedApiKey('custom-provider')).resolves.toBe('key-a');
  });

  test('rejects deleting registry and canonical preset providers', async () => {
    const registryTx = createDeleteTransaction({
      modelIds: [],
      presetProviderId: null,
      providerId: 'openai',
    });
    jest.mocked(providerRegistryService.isRegistryProvider).mockReturnValueOnce(true);

    await expect(createService(registryTx).delete('openai')).rejects.toThrow(
      "Cannot delete preset provider 'openai'",
    );
    expect(registryTx.delete).not.toHaveBeenCalled();

    const canonicalTx = createDeleteTransaction({
      modelIds: [],
      presetProviderId: 'canonical',
      providerId: 'canonical',
    });
    await expect(createService(canonicalTx).delete('canonical')).rejects.toThrow(
      "Cannot delete preset provider 'canonical'",
    );
    expect(canonicalTx.delete).not.toHaveBeenCalled();
  });
});

function createService(tx: object, pinService?: PinService): ProviderService {
  return new ProviderService(
    {
      getDb: () => ({}),
      withWriteTx: async (callback: (transaction: object) => Promise<unknown>) => callback(tx),
    } as unknown as DbService,
    pinService ?? createPinServiceStub(),
  );
}

function apiKey(id: string, key: string, isEnabled = true): ApiKeyEntry {
  return { id, isEnabled, key };
}

/** Service whose db always resolves one provider row with the given API keys. */
function createRotationService(apiKeys: ApiKeyEntry[], writeTransaction?: object) {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => [{ apiKeys }]),
        })),
      })),
    })),
  };

  return new ProviderService(
    {
      getDb: () => db,
      withWriteTx: async (callback: (transaction: object) => Promise<unknown>) =>
        callback(writeTransaction ?? {}),
    } as unknown as DbService,
    createPinServiceStub(),
  );
}

function createPinServiceStub(): PinService {
  return {
    purgeForEntitiesTx: jest.fn(async () => undefined),
  } as unknown as PinService;
}

function createDeleteTransaction(input: {
  modelIds: string[];
  presetProviderId: string | null;
  providerId: string;
}) {
  return {
    delete: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => [{ providerId: input.providerId }]),
      })),
    })),
    select: jest.fn((projection: Record<string, unknown>) => ({
      from: jest.fn(() => ({
        where: jest.fn(() =>
          'presetProviderId' in projection
            ? {
                limit: jest.fn(async () => [{ presetProviderId: input.presetProviderId }]),
              }
            : Promise.resolve(input.modelIds.map((id) => ({ id }))),
        ),
      })),
    })),
  };
}

function createProviderRow(providerSettings: ProviderSettings): UserProviderRow {
  return {
    apiFeatures: null,
    apiKeys: [],
    authConfig: null,
    createdAt: 1_767_225_600_000,
    defaultChatEndpoint: null,
    endpointConfigs: null,
    isEnabled: true,
    name: 'Custom provider',
    orderKey: 'a0',
    presetProviderId: null,
    providerId: 'custom-provider',
    providerSettings,
    updatedAt: 1_767_225_600_000,
  };
}
