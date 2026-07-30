import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/backend/infrastructure/db/DbService';
import { schema } from '@/backend/infrastructure/db/schemas';

import { AssistantService } from '../AssistantService';
import { McpServerService } from '../McpServerService';
import type { ModelService } from '../ModelService';
import type { PinService } from '../PinService';
import type { PreferenceService } from '../PreferenceService';
import type { TagService } from '../TagService';

jest.mock('uuid', () => ({ v7: mockRandomUUID }));

type MigrationJournal = { entries: { tag: string }[] };

describe('AssistantService MCP associations', () => {
  let sqlite: DatabaseSync;
  let assistantService: AssistantService;
  let mcpServerService: McpServerService;

  beforeEach(() => {
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
    const dbService = {
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
    const tagService = {
      getTagsByEntitiesTx: jest.fn(async () => new Map()),
    } as unknown as TagService;
    assistantService = new AssistantService(
      dbService,
      {} as ModelService,
      {} as PreferenceService,
      tagService,
      {} as PinService,
    );
    mcpServerService = new McpServerService(dbService);
  });

  afterEach(() => sqlite.close());

  it('replaces all MCP associations regardless of transport', async () => {
    const a = await mcpServerService.create(
      { baseUrl: 'https://a.example/mcp', name: 'A' },
      'streamableHttp',
    );
    const b = await mcpServerService.create(
      { baseUrl: 'https://b.example/mcp', name: 'B' },
      'streamableHttp',
    );
    const c = await mcpServerService.create(
      { baseUrl: 'https://c.example/mcp', name: 'C' },
      'streamableHttp',
    );
    insertRawServer(sqlite, 'hidden-stdio', 'Hidden', 'stdio');
    insertAssistant(sqlite, 'assistant-1');
    insertAssociation(sqlite, 'assistant-1', 'hidden-stdio');

    await assistantService.update('assistant-1', {
      mcpServerIds: [a.id, b.id, 'hidden-stdio'],
    });
    expect(associationIds(sqlite)).toEqual([a.id, b.id, 'hidden-stdio'].sort());

    await assistantService.update('assistant-1', { mcpServerIds: [b.id, c.id] });
    expect(associationIds(sqlite)).toEqual([b.id, c.id].sort());

    await assistantService.update('assistant-1', { mcpServerIds: [] });
    expect(associationIds(sqlite)).toEqual([]);
  });

  it('rolls back relation changes when an MCP server id does not exist', async () => {
    const existing = await mcpServerService.create(
      { baseUrl: 'https://existing.example/mcp', name: 'Existing' },
      'streamableHttp',
    );
    insertAssistant(sqlite, 'assistant-1');
    insertAssociation(sqlite, 'assistant-1', existing.id);

    await expect(
      assistantService.update('assistant-1', { mcpServerIds: ['missing-server'] }),
    ).rejects.toBeDefined();
    expect(associationIds(sqlite)).toEqual([existing.id]);
  });
});

function applyMigrations(database: DatabaseSync) {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) {
        database.exec(statement);
      }
    }
  }
}

function insertAssistant(database: DatabaseSync, id: string) {
  database
    .prepare(
      `INSERT INTO assistant (id, name, emoji, settings, order_key, created_at, updated_at)
       VALUES (?, 'Assistant', 'x', '{}', 'a0', 1, 1)`,
    )
    .run(id);
}

function insertRawServer(
  database: DatabaseSync,
  id: string,
  name: string,
  type: 'stdio' | 'streamableHttp',
) {
  database
    .prepare(
      `INSERT INTO mcp_server (
        id, name, type, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 1, 1, 1)`,
    )
    .run(id, name, type);
}

function insertAssociation(database: DatabaseSync, assistantId: string, mcpServerId: string) {
  database
    .prepare(
      `INSERT INTO assistant_mcp_server (
        assistant_id, mcp_server_id, created_at, updated_at
      ) VALUES (?, ?, 1, 1)`,
    )
    .run(assistantId, mcpServerId);
}

function associationIds(database: DatabaseSync): string[] {
  return (
    database.prepare('SELECT mcp_server_id FROM assistant_mcp_server').all() as {
      mcp_server_id: string;
    }[]
  )
    .map((row) => row.mcp_server_id)
    .sort();
}
