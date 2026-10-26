import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { ProviderService } from '../ProviderService';

describe('ProviderService integration', () => {
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: ProviderService;

  beforeEach(async () => {
    testDatabase = createServiceTestDatabase();
    const cacheService = new CacheService(createInMemoryBackendCacheStorage());
    await cacheService._doInit();
    await installTestHost({ CacheService: cacheService, DbService: testDatabase.dbService });
    service = new ProviderService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    testDatabase.sqlite.close();
  });

  it('pages enabled providers before disabled providers without gaps or duplicates', async () => {
    insertProvider('disabled-b', false, 'a');
    insertProvider('enabled-b', true, 'a');
    insertProvider('disabled-a', false, 'b');
    insertProvider('enabled-a', true, 'a');
    insertProvider('unsupported', true, '0', 'grok-cli');

    const first = await service.listPage({ limit: 2 });
    const second = await service.listPage({ cursor: first.nextCursor, limit: 2 });

    expect(first.items.map((provider) => provider.id)).toEqual(['enabled-a', 'enabled-b']);
    expect(first.nextCursor).toBeDefined();
    expect(second.items.map((provider) => provider.id)).toEqual(['disabled-b', 'disabled-a']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('falls back to the first page when a cursor is malformed', async () => {
    insertProvider('enabled-a', true, 'a');
    insertProvider('disabled-a', false, 'a');

    const page = await service.listPage({ cursor: 'not-a-provider-cursor', limit: 1 });

    expect(page.items.map((provider) => provider.id)).toEqual(['enabled-a']);
  });

  it('persists key order and restarts rotation at the first enabled entry', async () => {
    insertProvider('key-provider', true, 'a');
    const a = { id: 'a', isEnabled: true, key: 'key-a', label: 'Work' };
    const b = { id: 'b', isEnabled: true, key: 'key-b', label: 'Personal' };
    const c = { id: 'c', isEnabled: true, key: 'key-c', label: 'Backup' };
    const disabled = { id: 'disabled', isEnabled: false, key: 'key-disabled' };
    await service.update('key-provider', { apiKeys: [a, b, c, disabled] });
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-a');

    await service.update('key-provider', { apiKeys: [disabled, c, a, b] });
    await expect(service.listApiKeys('key-provider')).resolves.toEqual({
      keys: [disabled, c, a, b],
    });
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-c');
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-a');
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-b');
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-c');
  });

  it('preserves rotation on label edits and rejected writes, including explicit test-key overrides', async () => {
    insertProvider('key-provider', true, 'a');
    const a = { id: 'a', isEnabled: true, key: 'key-a' };
    const b = { id: 'b', isEnabled: true, key: 'key-b' };
    await service.replaceApiKeys('key-provider', [a, b]);
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-a');
    await service.updateApiKey('key-provider', 'a', { label: 'Renamed' });
    await expect(service.resolveApiKey('key-provider', 'key-b')).resolves.toMatchObject({
      value: 'key-b',
    });
    await expect(
      service.replaceApiKeys('key-provider', [b, { ...a, key: b.key }]),
    ).rejects.toThrow();
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-b');
  });

  function insertProvider(
    providerId: string,
    isEnabled: boolean,
    orderKey: string,
    presetProviderId: string | null = null,
  ) {
    testDatabase.sqlite
      .prepare(
        `INSERT INTO user_provider (
          provider_id, preset_provider_id, name, is_enabled, order_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 1)`,
      )
      .run(providerId, presetProviderId, providerId, isEnabled ? 1 : 0, orderKey);
  }
});
