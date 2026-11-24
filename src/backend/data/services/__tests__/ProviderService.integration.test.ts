import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { CacheService, createInMemoryBackendCacheStorage } from '@/backend/data/CacheService';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { ErrorCode } from '@/shared/data/api/errors';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { ProviderService } from '../ProviderService';

describe('ProviderService integration', () => {
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: ProviderService;

  beforeEach(async () => {
    testDatabase = createServiceTestDatabase();
    const cacheService = new CacheService(createInMemoryBackendCacheStorage());
    await cacheService._doInit();
    await installTestHost({
      CacheService: cacheService,
      DbService: testDatabase.dbService,
      ProviderCatalogRuntime: { ensureReady: async () => {} },
    });
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

  it('allows only the CherryAI switch and places its disabled row after enabled providers', async () => {
    insertProvider(CLOUD_PROVIDER_ID, true, 'z');
    insertProvider('enabled', true, 'a');
    insertProvider('disabled', false, 'b');
    await service.update(CLOUD_PROVIDER_ID, { isEnabled: false });
    const first = await service.listPage({ limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual(['enabled']);
    const second = await service.listPage({ cursor: first.nextCursor, limit: 1 });
    expect(second.items.map((item) => item.id)).toEqual([CLOUD_PROVIDER_ID]);
    const third = await service.listPage({ cursor: second.nextCursor, limit: 1 });
    expect(third.items.map((item) => item.id)).toEqual(['disabled']);

    await expect(
      service.update(CLOUD_PROVIDER_ID, { isEnabled: true, name: 'renamed' }),
    ).rejects.toThrow();
    await expect(service.delete(CLOUD_PROVIDER_ID)).rejects.toThrow();
    expect(await service.getByProviderId(CLOUD_PROVIDER_ID)).toMatchObject({ isEnabled: false });
    expect(await service.update(CLOUD_PROVIDER_ID, { isEnabled: true })).toMatchObject({
      isEnabled: true,
    });
  });

  it('pins Plan first in full and enabled lists without changing other providers saved order', async () => {
    insertProvider('disabled-a', false, 'a');
    insertProvider('enabled-a', true, 'b');
    insertProvider('enabled-b', true, 'c');
    insertProvider(CLOUD_PROVIDER_ID, true, 'z');

    const all = await service.list();
    const enabled = await service.list({ enabled: true });
    expect(all.map((provider) => provider.id)).toEqual([
      CLOUD_PROVIDER_ID,
      'disabled-a',
      'enabled-a',
      'enabled-b',
    ]);
    expect(enabled.map((provider) => provider.id)).toEqual([
      CLOUD_PROVIDER_ID,
      'enabled-a',
      'enabled-b',
    ]);
  });

  it('pages from pinned Plan through enabled and disabled providers without gaps or duplicates', async () => {
    insertProvider('disabled-a', false, 'a');
    insertProvider('enabled-a', true, 'a');
    insertProvider('enabled-b', true, 'b');
    insertProvider('disabled-b', false, 'b');
    insertProvider(CLOUD_PROVIDER_ID, true, 'z');

    const first = await service.listPage({ limit: 1 });
    expect(first.items.map((provider) => provider.id)).toEqual([CLOUD_PROVIDER_ID]);
    expect(first.nextCursor).toBeDefined();
    const second = await service.listPage({ cursor: first.nextCursor, limit: 2 });
    expect(second.items.map((provider) => provider.id)).toEqual(['enabled-a', 'enabled-b']);
    expect(second.nextCursor).toBeDefined();
    const third = await service.listPage({ cursor: second.nextCursor, limit: 2 });
    expect(third.items.map((provider) => provider.id)).toEqual(['disabled-a', 'disabled-b']);
    expect(third.nextCursor).toBeUndefined();
  });

  it('falls back to the first page when a cursor is malformed', async () => {
    insertProvider('enabled-a', true, 'a');
    insertProvider('disabled-a', false, 'a');

    const page = await service.listPage({ cursor: 'not-a-provider-cursor', limit: 1 });

    expect(page.items.map((provider) => provider.id)).toEqual(['enabled-a']);
  });

  it('rotates in the saved order, continuing after the last used key when reordered', async () => {
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
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-b');
    await expect(service.resolveApiKey('key-provider', 'key-a')).resolves.toMatchObject({
      value: 'key-a',
    });
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-c');
    await expect(service.getRotatedApiKey('key-provider')).resolves.toBe('key-a');
  });

  it('reorders within enabled and disabled groups while keeping CherryAI pinned first across pages', async () => {
    insertProvider(CLOUD_PROVIDER_ID, true, 'a9');
    insertProvider('enabled-a', true, 'a0');
    insertProvider('enabled-b', true, 'a1');
    insertProvider('enabled-c', true, 'a2');
    insertProvider('disabled-a', false, 'a0');
    insertProvider('disabled-b', false, 'a1');

    await service.reorder('enabled-c', { position: 'first' });
    await service.reorder('disabled-b', { before: 'disabled-a' });

    await expect(service.list({ enabled: true })).resolves.toMatchObject([
      { id: CLOUD_PROVIDER_ID },
      { id: 'enabled-c' },
      { id: 'enabled-a' },
      { id: 'enabled-b' },
    ]);
    await expect(service.list({ enabled: false })).resolves.toMatchObject([
      { id: 'disabled-b' },
      { id: 'disabled-a' },
    ]);

    const page1 = await service.listPage({ limit: 2 });
    const page2 = await service.listPage({ cursor: page1.nextCursor, limit: 2 });
    const page3 = await service.listPage({ cursor: page2.nextCursor, limit: 2 });
    expect([...page1.items, ...page2.items, ...page3.items].map((p) => p.id)).toEqual([
      CLOUD_PROVIDER_ID,
      'enabled-c',
      'enabled-a',
      'enabled-b',
      'disabled-b',
      'disabled-a',
    ]);
    expect(page3.nextCursor).toBeUndefined();

    // Batch reorder within enabled providers
    await service.reorderBatch([
      { id: 'enabled-b', anchor: { position: 'first' } },
      { id: 'enabled-a', anchor: { after: 'enabled-b' } },
    ]);
    const enabledAfterBatch = await service.list({ enabled: true });
    expect(enabledAfterBatch.map((p) => p.id)).toEqual([
      CLOUD_PROVIDER_ID,
      'enabled-b',
      'enabled-a',
      'enabled-c',
    ]);

    // Reject cross-group anchors and CherryAI target/anchors
    await expect(service.reorder('enabled-a', { before: 'disabled-a' })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    await expect(service.reorder(CLOUD_PROVIDER_ID, { position: 'last' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_OPERATION,
    });
    await expect(service.reorder('enabled-a', { after: CLOUD_PROVIDER_ID })).rejects.toMatchObject({
      code: ErrorCode.INVALID_OPERATION,
    });
  });

  it('can insert between providers whose keys coincide after enabling one of them', async () => {
    insertProvider('a', true, 'a0');
    insertProvider('b', false, 'a1');
    insertProvider('c', true, 'a2');
    insertProvider('d', true, 'a3');
    await service.reorder('d', { before: 'c' });
    await service.update('b', { isEnabled: true });
    // The new group has b and d at a1, in provider ID order.
    await service.reorder('c', { after: 'b' });
    const page = await service.listPage();
    expect(page.items.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd']);
    expect((await service.list({ enabled: true })).map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
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
