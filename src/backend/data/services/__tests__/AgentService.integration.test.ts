import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import type { PreferenceService } from '../../PreferenceService';
import { agentService } from '../AgentService';
import { applyMigrations } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

describe('AgentService persistence', () => {
  let sqlite: DatabaseSync;
  let dbService: DbService;
  let preferenceGet: jest.Mock;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyMigrations(sqlite);
    const database = drizzle(
      async (sql, params, method) => {
        const statement = sqlite.prepare(sql);
        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        if (method === 'get') {
          const row = statement.get(...params) as Record<string, unknown> | undefined;
          return { rows: row ? Object.values(row) : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map((row) => Object.values(row)) };
      },
      undefined as never,
      { casing: 'snake_case', schema },
    ) as unknown as Database;
    dbService = {
      getDb: () => database,
      withWriteTx: async <T>(callback: (tx: Database) => Promise<T>) => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const result = await callback(database);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as DbService;
    preferenceGet = jest.fn(async () => null);
    // Data services resolve `DbService` from `application`, so the fake is
    // installed as a host override instead of being passed to constructors.
    await installTestHost({
      DbService: dbService,
      PreferenceService: { get: preferenceGet } as unknown as PreferenceService,
    });
  });

  afterEach(async () => {
    await uninstallTestHost();
    jest.restoreAllMocks();
    sqlite.close();
  });

  it('creates with default settings and inherits the default-model preference', async () => {
    insertUserModel(sqlite, 'openai', 'gpt-4');
    preferenceGet.mockResolvedValue('openai::gpt-4');

    const agent = await agentService.create({ name: 'Researcher' });

    expect(agent).toMatchObject({
      avatar: null,
      instructions: '',
      modelId: 'openai::gpt-4',
      name: 'Researcher',
      settings: {},
    });
  });

  it('falls back to no model when the preferred default is not registered', async () => {
    preferenceGet.mockResolvedValue('openai::missing');

    const agent = await agentService.create({ name: 'Researcher' });

    expect(agent.modelId).toBeNull();
  });

  it('rejects a create or update whose model is not registered', async () => {
    await expect(
      agentService.create({ modelId: 'openai::unknown', name: 'Researcher' }),
    ).rejects.toBeDefined();

    const agent = await agentService.create({ name: 'Researcher' });
    await expect(
      agentService.update(agent.id, { modelId: 'openai::unknown' }),
    ).rejects.toBeDefined();
  });

  it('merges settings updates over the stored blob instead of replacing it', async () => {
    const agent = await agentService.create({
      name: 'Researcher',
      settings: { futureSetting: true, temperature: 0.2 },
    });

    const updated = await agentService.update(agent.id, {
      settings: { reasoningEffort: 'high' },
    });

    expect(updated.settings).toEqual({
      futureSetting: true,
      reasoningEffort: 'high',
      temperature: 0.2,
    });
  });

  it('advances the Agent version when updates share one wall-clock millisecond', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const agent = await agentService.create({ name: 'Researcher' });

    const firstUpdate = await agentService.update(agent.id, { instructions: 'First' });
    const secondUpdate = await agentService.update(agent.id, { instructions: 'Second' });

    expect(Date.parse(firstUpdate.updatedAt)).toBeGreaterThan(Date.parse(agent.updatedAt));
    expect(Date.parse(secondUpdate.updatedAt)).toBeGreaterThan(Date.parse(firstUpdate.updatedAt));
  });

  it('clears a stored setting when the patch carries the key as explicit undefined', async () => {
    const agent = await agentService.create({
      name: 'Researcher',
      settings: { futureSetting: true, temperature: 0.2 },
    });

    const updated = await agentService.update(agent.id, {
      settings: { temperature: undefined },
    });

    expect(updated.settings).toEqual({ futureSetting: true });
    // The JSON column must not resurrect the key on a fresh read.
    expect((await agentService.getById(agent.id)).settings).toEqual({ futureSetting: true });
  });

  it('filters by search and persists explicit ordering changes', async () => {
    const researcher = await agentService.create({ name: 'Primary Researcher' });
    const writer = await agentService.create({ name: 'Writer' });

    await expect(agentService.list({ search: 'primary' })).resolves.toMatchObject({
      items: [{ id: researcher.id }],
      total: 1,
    });

    await agentService.reorder(writer.id, { position: 'first' });
    expect((await agentService.list()).items.map((agent) => agent.id)).toEqual([
      writer.id,
      researcher.id,
    ]);

    await agentService.reorderBatch([{ anchor: { position: 'first' }, id: researcher.id }]);
    expect((await agentService.list()).items.map((agent) => agent.id)).toEqual([
      researcher.id,
      writer.id,
    ]);
  });

  it('soft-deletes: the row is tombstoned and leaves reads and the list', async () => {
    const agent = await agentService.create({ name: 'Researcher' });

    await expect(agentService.delete(agent.id)).resolves.toEqual({ deleted: true });

    expect(readAgentDeleteState(sqlite, agent.id)).toEqual({ deleted_at: expect.any(Number) });
    await expect(agentService.getById(agent.id)).rejects.toBeDefined();
    await expect(agentService.getById(agent.id, { includeDeleted: true })).resolves.toMatchObject({
      id: agent.id,
    });
    expect((await agentService.list()).items).toEqual([]);
    await expect(agentService.delete(agent.id)).rejects.toBeDefined();
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

function readAgentDeleteState(database: DatabaseSync, id: string) {
  return database.prepare('SELECT deleted_at FROM agent WHERE id = ?').get(id) as {
    deleted_at: number | null;
  };
}
