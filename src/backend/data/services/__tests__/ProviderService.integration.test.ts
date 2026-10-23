import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { batchUpsertProviders, ProviderService } from '../ProviderService';

describe('ProviderService integration', () => {
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: ProviderService;

  beforeEach(async () => {
    testDatabase = createServiceTestDatabase();
    await installTestHost({ DbService: testDatabase.dbService });
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

  it('preserves saved connections and credentials when seeding newer cloud defaults', async () => {
    const apiKeys = [{ id: 'saved-key', key: 'saved-secret', isEnabled: true }];
    await service.create({
      providerId: 'saved-copy',
      presetProviderId: 'openai',
      name: 'My provider',
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://my-relay.example/v1' },
      },
      apiKeys,
      authConfig: { type: 'api-key', required: true },
    });
    await testDatabase.dbService.withWriteTx((tx) =>
      batchUpsertProviders(tx, [
        {
          providerId: 'saved-copy',
          presetProviderId: 'openai',
          name: 'New cloud name',
          defaultChatEndpoint: 'openai-responses',
          endpointConfigs: {
            'openai-chat-completions': { baseUrl: 'https://new-cloud.example/v1' },
          },
          apiKeys: [{ id: 'replacement', key: 'replacement', isEnabled: true }],
          authConfig: { type: 'api-key', required: false },
        },
      ]),
    );
    expect(await service.getRowByProviderId('saved-copy')).toMatchObject({
      name: 'My provider',
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://my-relay.example/v1' },
      },
      apiKeys,
      authConfig: { type: 'api-key', required: true },
    });
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
