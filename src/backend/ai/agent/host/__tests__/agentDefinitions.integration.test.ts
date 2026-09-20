import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { createTestDb } from '@/backend/data/services/__tests__/_testDb';
import { agentService } from '@/backend/data/services/AgentService';
import { installProviderRegistryTestSnapshot } from '@/backend/data/services/providerRegistryTestSnapshot';

import { createAgentTableDefinitionSource } from '../agentDefinitions';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

beforeEach(installProviderRegistryTestSnapshot);

describe('agent-table definition source', () => {
  let sqlite: DatabaseSync;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    const { dbService } = createTestDb(sqlite);
    await installTestHost({
      DbService: dbService,
      PreferenceService: { get: jest.fn(async () => null) } as unknown as PreferenceService,
    });
  });

  afterEach(async () => {
    await uninstallTestHost();
    jest.restoreAllMocks();
    sqlite.close();
  });

  test('maps live modeled agents and hides missing or deleted agents', async () => {
    insertUserModel(sqlite, 'openai', 'gpt-4');
    const source = createAgentTableDefinitionSource();
    const agent = await agentService.create({
      disabledCapabilities: ['health'],
      instructions: 'Be terse.',
      modelId: 'openai::gpt-4',
      name: 'Researcher',
      toolApprovalMode: 'auto',
    });

    await expect(source.getAgent(agent.id)).resolves.toEqual({
      disabledCapabilities: ['health'],
      id: agent.id,
      instructions: 'Be terse.',
      model: { modelId: 'gpt-4', providerId: 'openai' },
      name: 'Researcher',
      options: {},
      toolApprovalMode: 'auto',
    });

    await expect(source.getAgent('missing-agent')).resolves.toBeNull();

    await agentService.delete(agent.id);
    await expect(source.getAgent(agent.id)).resolves.toBeNull();
  });

  test('reports an unconfigured model separately from a missing agent', async () => {
    const source = createAgentTableDefinitionSource();
    const agent = await agentService.create({ modelId: null, name: 'No Model' });

    await expect(source.getAgent(agent.id)).rejects.toMatchObject({
      name: 'AgentProtocolError',
      view: { code: 'AGENT_MODEL_NOT_CONFIGURED', retryable: false },
    });
  });
});

function insertUserModel(database: DatabaseSync, providerId: string, modelId: string) {
  database
    .prepare(
      `INSERT INTO user_provider (provider_id, name, order_key, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1)`,
    )
    .run(providerId, providerId, providerId);
  database
    .prepare(
      `INSERT INTO user_model (
        id, provider_id, model_id, name, preset_model_id, order_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
    )
    .run(`${providerId}::${modelId}`, providerId, modelId, modelId, modelId, modelId);
}
