import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { installProviderRegistryTestSnapshot } from '../providerRegistryTestSnapshot';
import { ProviderService } from '../ProviderService';

describe('ProviderService integration', () => {
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: ProviderService;

  beforeEach(async () => {
    installProviderRegistryTestSnapshot();
    testDatabase = createServiceTestDatabase();
    await installTestHost({ DbService: testDatabase.dbService });
    service = new ProviderService();
  });

  it('projects billing for a copied preset and removes it when the account routes through a gateway', async () => {
    const provider = await service.create({
      providerId: 'my-deepseek',
      presetProviderId: 'deepseek',
      name: 'My DeepSeek',
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://api.deepseek.com/v1' },
      },
    });
    expect(provider.websites?.billing).toBe('https://platform.deepseek.com/top_up');

    const changed = await service.update('my-deepseek', {
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://gateway.example.com/v1' },
      },
    });
    expect(changed.websites?.billing).toBeUndefined();
    expect(changed.websites?.official).toBe(provider.websites?.official);
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
