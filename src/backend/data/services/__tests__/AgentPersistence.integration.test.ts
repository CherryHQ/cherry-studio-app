import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { customSqlStatements } from '@/backend/data/db/customSql';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { schema } from '@/backend/data/db/schemas';

import { AgentChannelService } from '../AgentChannelService';
import { AgentService } from '../AgentService';
import { AgentSessionMessageService } from '../AgentSessionMessageService';
import { AgentSessionService } from '../AgentSessionService';
import { AgentWorkspaceService } from '../AgentWorkspaceService';
import { PinService } from '../PinService';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: (lower: null | string) => `${lower ?? 'a'}0`,
  generateNKeysBetween: (lower: null | string, _upper: null | string, count: number) => {
    const keys: string[] = [];
    let previous = lower ?? 'a';
    for (let index = 0; index < count; index += 1) {
      previous = `${previous}0`;
      keys.push(previous);
    }
    return keys;
  },
}));

type MigrationJournal = { entries: { tag: string }[] };

describe('Agent persistence integration', () => {
  let sqlite: DatabaseSync;
  let database: Database;
  let dbService: DbService;
  let channels: AgentChannelService;
  let messages: AgentSessionMessageService;
  let sessions: AgentSessionService;
  let workspaces: AgentWorkspaceService;
  let agents: AgentService;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyMigrations(sqlite);
    for (const statement of customSqlStatements) sqlite.exec(statement);

    database = drizzle(
      async (query, params, method) => {
        const statement = sqlite.prepare(query);
        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        if (method === 'get') {
          const row = statement.get(...params) as Record<string, unknown> | undefined;
          return { rows: row ? hybridRow(row) : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map(hybridRow) };
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

    const pins = new PinService(dbService);
    workspaces = new AgentWorkspaceService(dbService);
    sessions = new AgentSessionService(dbService, workspaces, pins);
    messages = new AgentSessionMessageService(dbService);
    channels = new AgentChannelService(dbService);
    agents = new AgentService(dbService, sessions, pins);
  });

  afterEach(() => sqlite.close());

  test('retains opaque Agent, Knowledge, non-HTTP MCP, and channel data across partial updates', async () => {
    await database.insert(schema.knowledgeBaseTable).values({
      chunkOverlap: 50,
      chunkSize: 500,
      id: 'knowledge-opaque',
      name: 'Hidden Knowledge',
      status: 'completed',
    });
    await database.insert(schema.mcpServerTable).values({
      args: ['--stdio'],
      command: 'desktop-only-command',
      env: { DESKTOP_SECRET_REF: 'opaque' },
      id: 'mcp-stdio',
      isActive: true,
      name: 'Hidden stdio server',
      type: 'stdio',
    });
    await database.insert(schema.agentTable).values({
      configuration: {
        future_desktop_setting: { nested: true },
        max_turns: 5,
      },
      description: 'Persist without mobile UI',
      id: 'agent-opaque',
      instructions: 'Keep all fields',
      model: null,
      name: 'Opaque Agent',
      orderKey: 'a0',
      type: 'claude-code',
    });
    await database.insert(schema.agentKnowledgeBaseTable).values({
      agentId: 'agent-opaque',
      knowledgeBaseId: 'knowledge-opaque',
    });
    await database.insert(schema.agentMcpServerTable).values({
      agentId: 'agent-opaque',
      mcpServerId: 'mcp-stdio',
    });
    await database.insert(schema.agentChannelTable).values({
      activeChatIds: ['desktop-chat'],
      agentId: 'agent-opaque',
      config: {
        bot_token: 'secret-ref',
        future_desktop_field: { retain: true },
      },
      id: 'channel-opaque',
      isActive: false,
      name: 'Opaque Channel',
      permissionMode: 'plan',
      type: 'telegram',
      workspace: { type: 'system' },
    });

    await expect(
      agents.updateAgent('agent-opaque', {
        configuration: { heartbeat_enabled: true },
        name: 'Renamed Agent',
      }),
    ).resolves.toMatchObject({
      configuration: {
        future_desktop_setting: { nested: true },
        heartbeat_enabled: true,
        max_turns: 5,
      },
      knowledgeBaseIds: ['knowledge-opaque'],
      mcps: ['mcp-stdio'],
      name: 'Renamed Agent',
    });
    await expect(
      channels.updateChannel('channel-opaque', { name: 'Renamed Channel' }),
    ).resolves.toMatchObject({
      activeChatIds: ['desktop-chat'],
      config: {
        bot_token: 'secret-ref',
        future_desktop_field: { retain: true },
      },
      name: 'Renamed Channel',
      permissionMode: 'plan',
    });

    const mcp = sqlite
      .prepare('SELECT type, command, args, env FROM mcp_server WHERE id = ?')
      .get('mcp-stdio') as { args: string; command: string; env: string; type: string };
    expect({
      ...mcp,
      args: JSON.parse(mcp.args),
      env: JSON.parse(mcp.env),
    }).toEqual({
      args: ['--stdio'],
      command: 'desktop-only-command',
      env: { DESKTOP_SECRET_REF: 'opaque' },
      type: 'stdio',
    });
  });

  test('paginates pinned sessions and messages without gaps or duplicates', async () => {
    await seedAgent(database, 'agent-pages');
    await database.insert(schema.agentWorkspaceTable).values({
      id: 'workspace-pages',
      name: 'Pages',
      orderKey: 'a0',
      path: '/tmp/pages',
      type: 'user',
    });
    await database
      .insert(schema.agentSessionTable)
      .values([
        sessionRow('session-a', 'agent-pages', 'workspace-pages', 'a0'),
        sessionRow('session-b', 'agent-pages', 'workspace-pages', 'a1'),
        sessionRow('session-pinned', 'agent-pages', 'workspace-pages', 'z0'),
      ]);
    await database.insert(schema.pinTable).values({
      entityId: 'session-pinned',
      entityType: 'session',
      id: 'pin-session',
      orderKey: 'a0',
    });

    const firstSessions = await sessions.listByCursor({ agentId: 'agent-pages', limit: 2 });
    expect(firstSessions.items.map(({ id }) => id)).toEqual(['session-pinned', 'session-a']);
    expect(firstSessions.nextCursor).toBeDefined();
    const secondSessions = await sessions.listByCursor({
      agentId: 'agent-pages',
      cursor: firstSessions.nextCursor,
      limit: 2,
    });
    expect(secondSessions.items.map(({ id }) => id)).toEqual(['session-b']);

    await database
      .insert(schema.agentSessionMessageTable)
      .values([
        messageRow('message-a', 'session-a', 100),
        messageRow('message-b', 'session-a', 200),
        messageRow('message-c', 'session-a', 300),
      ]);
    const firstMessages = await messages.listSessionMessages('session-a', { limit: 2 });
    expect(firstMessages.items.map(({ id }) => id)).toEqual(['message-c', 'message-b']);
    expect(firstMessages.nextCursor).toBeDefined();
    const secondMessages = await messages.listSessionMessages('session-a', {
      cursor: firstMessages.nextCursor,
      limit: 2,
    });
    expect(secondMessages.items.map(({ id }) => id)).toEqual(['message-a']);
  });

  test('cleans pins, messages, and system workspaces while retaining unrelated user workspaces', async () => {
    await seedAgent(database, 'agent-delete');
    const userWorkspace = await workspaces.findOrCreateByPath('/tmp/retained-user-workspace');
    const userSession = await sessions.create({
      agentId: 'agent-delete',
      name: 'User workspace session',
      workspace: { type: 'user', workspaceId: userWorkspace.id },
    });
    const systemSession = await sessions.create({
      agentId: 'agent-delete',
      name: 'System workspace session',
      workspace: { type: 'system' },
    });
    await database
      .insert(schema.agentSessionMessageTable)
      .values([
        messageRow('message-user', userSession.id, 100),
        messageRow('message-system', systemSession.id, 200),
      ]);
    await database.insert(schema.pinTable).values([
      {
        entityId: 'agent-delete',
        entityType: 'agent',
        id: 'pin-agent',
        orderKey: 'a0',
      },
      {
        entityId: userSession.id,
        entityType: 'session',
        id: 'pin-user-session',
        orderKey: 'a0',
      },
      {
        entityId: systemSession.id,
        entityType: 'session',
        id: 'pin-system-session',
        orderKey: 'a1',
      },
    ]);

    await expect(agents.deleteAgent('agent-delete', { deleteSessions: true })).resolves.toEqual({
      deleted: true,
      deletedSessionIds: expect.arrayContaining([userSession.id, systemSession.id]),
    });

    expect(countRows(sqlite, 'agent')).toBe(0);
    expect(countRows(sqlite, 'agent_session')).toBe(0);
    expect(countRows(sqlite, 'agent_session_message')).toBe(0);
    expect(countRows(sqlite, 'pin')).toBe(0);
    expect(
      sqlite.prepare('SELECT id FROM agent_workspace ORDER BY id').all() as Array<{ id: string }>,
    ).toEqual([{ id: userWorkspace.id }]);
  });
});

function applyMigrations(database: DatabaseSync): void {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;
  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
}

function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}

async function seedAgent(database: Database, id: string): Promise<void> {
  await database.insert(schema.agentTable).values({
    description: '',
    id,
    instructions: 'Persisted only',
    model: null,
    name: id,
    orderKey: 'a0',
    type: 'claude-code',
  });
}

function sessionRow(id: string, agentId: string, workspaceId: string, orderKey: string) {
  return {
    agentId,
    id,
    name: id,
    orderKey,
    workspaceId,
  };
}

function messageRow(id: string, sessionId: string, createdAt: number) {
  return {
    createdAt,
    data: {
      parts: [
        {
          providerMetadata: { desktop: { opaque: true } },
          text: id,
          type: 'text' as const,
        },
      ],
    },
    id,
    role: 'user',
    runtimeResumeToken: `resume-${id}`,
    sessionId,
    status: 'success',
    updatedAt: createdAt,
  };
}

function countRows(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT count(*) AS value FROM ${table}`).get() as { value: number };
  return row.value;
}
