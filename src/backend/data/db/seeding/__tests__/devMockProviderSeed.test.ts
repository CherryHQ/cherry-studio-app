import { DatabaseSync } from 'node:sqlite';

import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { DEV_MOCK_UNIQUE_MODEL_ID } from '@/shared/utils/devMockProvider';

import { syncDevMockProvider } from '../seeders/devMockProviderSeed';

it('withdraws the mock model and restores only the fixture-owned default across mode changes', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const { dbService } = createTestDb(sqlite);
    const provider = sqlite.prepare(
      "SELECT is_enabled FROM user_provider WHERE provider_id = 'dev-mock'",
    );
    const model = sqlite.prepare(
      "SELECT is_enabled FROM user_model WHERE provider_id = 'dev-mock'",
    );
    const defaultModel = sqlite.prepare(
      "SELECT value FROM preference WHERE key = 'agent.default_model_id'",
    );

    await syncDevMockProvider(dbService, true);
    expect(defaultModel.get()).toEqual({ value: JSON.stringify(DEV_MOCK_UNIQUE_MODEL_ID) });

    await syncDevMockProvider(dbService, false);
    expect(provider.get()).toEqual({ is_enabled: 0 });
    expect(model.get()).toEqual({ is_enabled: 0 });
    expect(defaultModel.get()).toEqual({ value: null });

    const realModelId = 'custom::real-model';
    sqlite
      .prepare("UPDATE preference SET value = ? WHERE key = 'agent.default_model_id'")
      .run(JSON.stringify(realModelId));
    await syncDevMockProvider(dbService, true);
    expect(provider.get()).toEqual({ is_enabled: 1 });
    expect(model.get()).toEqual({ is_enabled: 1 });

    await syncDevMockProvider(dbService, false);
    expect(defaultModel.get()).toEqual({ value: JSON.stringify(realModelId) });
  } finally {
    sqlite.close();
  }
});
