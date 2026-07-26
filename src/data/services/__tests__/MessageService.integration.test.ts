import { randomUUID as mockRandomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { Database, DbService } from '@/data/db/DbService';
import { schema } from '@/data/db/schemas';
import type { CherryMessagePart, Message } from '@/data/types/message';
import { FileEntryService } from '../FileEntryService';
import { MessageService } from '../MessageService';
import { PinService } from '../PinService';
import { TagService } from '../TagService';
import { TopicService } from '../TopicService';

// Rows are inserted in bulk here, so unlike the fixed-id mocks elsewhere these
// have to be distinct. `expo-crypto` is already mocked the same way globally.
jest.mock('uuid', () => ({ v7: mockRandomUUID }));

// `fractional-indexing` is ESM-only and outside jest's transform allowlist, so
// importing the real TopicService fails to parse without this. Appending to the
// previous key keeps the "last" insert lexicographically greatest, which is all
// topic creation asks of it — no service under test is faked.
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

/**
 * The mock-based sibling suite pins the call shapes; this one pins the SQL, so
 * a regression in a WHERE clause or a transaction boundary fails a test instead
 * of quietly shipping. Every collaborator is the real service over the same
 * in-memory database — nothing here is a stand-in.
 */
describe('MessageService integration', () => {
  let sqlite: DatabaseSync;
  let service: MessageService;
  let topicService: TopicService;

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
          return { rows: row ? hybridRow(row) : [] };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map(hybridRow) };
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
    topicService = new TopicService(
      dbService,
      new PinService(dbService),
      new TagService(dbService),
    );
    service = new MessageService(dbService, topicService, new FileEntryService(dbService));
  });

  afterEach(() => sqlite.close());

  // The approval resume hands the SDK the paused assistant message's own id and
  // expects the stream to continue that row. That only works while the row is
  // part of the history the path builds, so its own presence is the contract.
  test('getPathToNode ends at the requested node and drops the virtual root', async () => {
    const topic = await topicService.create({ name: 'path' });
    const user = await service.create(topic.id, {
      data: { parts: [{ text: 'hi', type: 'text' }] },
      role: 'user',
    });
    const assistant = await service.create(topic.id, { data: { parts: [] }, role: 'assistant' });

    const path = await service.getPathToNode(assistant.id);

    expect(path.map((message) => message.id)).toEqual([user.id, assistant.id]);
    expect(path.at(-1)?.id).toBe(assistant.id);
    expect(path.map((message) => message.role)).not.toContain('root');
  });

  // Cold-start reconcile settles whatever this returns to `error`. A `paused`
  // row is waiting on a human, so matching it here would destroy every tool
  // approval sheet on app start.
  test('findPendingAssistantMessageIds returns only live pending assistant rows', async () => {
    const topic = await topicService.create({ name: 'reconcile' });
    const create = (role: 'assistant' | 'user', status: Message['status']) =>
      service.create(topic.id, { data: { parts: [] }, role, setAsActive: false, status });

    const pending = await create('assistant', 'pending');
    await create('assistant', 'paused');
    await create('assistant', 'success');
    await create('assistant', 'error');
    await create('user', 'pending');
    const softDeleted = await create('assistant', 'pending');
    sqlite.prepare('UPDATE message SET deleted_at = 1 WHERE id = ?').run(softDeleted.id);

    await expect(service.findPendingAssistantMessageIds()).resolves.toEqual([pending.id]);
  });

  describe('createUserMessageWithPlaceholders finalizeToolApprovals', () => {
    async function seedTip(status: Message['status'], role: Message['role'] = 'assistant') {
      const topic = await topicService.create({ name: 'approval' });
      await service.create(topic.id, { data: { parts: [] }, role: 'user' });
      const tip = await service.create(topic.id, {
        data: { parts: [requestedPart('a1'), respondedPart('a2')] },
        role,
        status,
      });

      return { tip, topic };
    }

    function reserve(
      topicId: string,
      tipId: string,
      userMessage: Parameters<
        MessageService['createUserMessageWithPlaceholders']
      >[0]['userMessage'],
    ) {
      return service.createUserMessageWithPlaceholders({
        finalizeToolApprovals: { messageId: tipId, reason: 'superseded' },
        placeholders: [{ data: { parts: [] }, role: 'assistant' }],
        topicId,
        userMessage,
      });
    }

    const newUserMessage = {
      dto: { data: { parts: [{ text: 'next', type: 'text' as const }] }, role: 'user' as const },
      mode: 'create' as const,
    };

    test('settles the superseded tip terminally in the same transaction', async () => {
      const { tip, topic } = await seedTip('paused');

      const result = await reserve(topic.id, tip.id, newUserMessage);

      const settled = await service.getById(tip.id);
      // 'approval-responded' is transient: only terminal states make
      // convertToModelMessages emit a tool result for the abandoned call.
      expect(partStates(settled)).toEqual(['output-denied', 'output-error']);
      expect(settled.data.parts?.[0]).toMatchObject({
        approval: { approved: false, id: 'a1', reason: 'superseded' },
      });
      expect(settled.data.parts?.[1]).toMatchObject({
        approval: { approved: true, id: 'a2' },
        errorText: 'superseded',
      });
      expect(result.placeholders).toHaveLength(1);
    });

    // Only meaningful next to the test above: on its own it would also pass if
    // the finalize never ran at all. The pair is what pins the rollback — keep
    // them together, or this one silently stops covering anything.
    test('rolls the finalize back when the reservation fails', async () => {
      const { tip, topic } = await seedTip('paused');
      const otherTopic = await topicService.create({ name: 'elsewhere' });
      const foreign = await service.create(otherTopic.id, { data: { parts: [] }, role: 'user' });

      // Rejected by the topic-ownership check, which runs after the finalize.
      await expect(
        reserve(topic.id, tip.id, { id: foreign.id, mode: 'existing' }),
      ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });

      const untouched = await service.getById(tip.id);
      expect(partStates(untouched)).toEqual(['approval-requested', 'approval-responded']);
      expect(untouched.status).toBe('paused');
    });

    test('settles a stranded pending tip and gives it a terminal status', async () => {
      // A resume that died before writing leaves the row `pending` with nobody
      // to finish it. Sending again is its only repair: the branch it belongs
      // to is about to be replayed with the tool call still unanswered.
      const { tip, topic } = await seedTip('pending');

      await reserve(topic.id, tip.id, newUserMessage);

      const settled = await service.getById(tip.id);
      expect(partStates(settled)).toEqual(['output-denied', 'output-error']);
      expect(settled.status).toBe('error');
    });

    test('leaves a tip that is no longer paused alone', async () => {
      const { tip, topic } = await seedTip('success');

      await reserve(topic.id, tip.id, newUserMessage);

      const untouched = await service.getById(tip.id);
      expect(partStates(untouched)).toEqual(['approval-requested', 'approval-responded']);
    });

    test('leaves a user tip alone and still reserves the turn', async () => {
      // The caller names the topic's active node without inspecting it, so the
      // node it points at is routinely a user row and a send must not fail on
      // account of it. `pending` is the status that would otherwise force the
      // rewrite, so the role check is the only thing holding the write off.
      const { tip, topic } = await seedTip('pending', 'user');

      const result = await reserve(topic.id, tip.id, newUserMessage);

      expect(result.placeholders).toHaveLength(1);
      const untouched = await service.getById(tip.id);
      expect(partStates(untouched)).toEqual(['approval-requested', 'approval-responded']);
      expect(untouched.status).toBe('pending');
    });
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

/**
 * Positional for drizzle's column mapper, named for the raw `db.all` queries
 * the recursive tree walks use — drizzle hands those rows straight back
 * unmapped, so the proxy has to answer in both shapes at once.
 */
function hybridRow(row: Record<string, unknown>): unknown[] {
  return Object.assign(Object.values(row), row);
}

function requestedPart(approvalId: string): CherryMessagePart {
  return {
    approval: { id: approvalId },
    input: {},
    state: 'approval-requested',
    toolCallId: `call-${approvalId}`,
    toolName: 'search',
    type: 'dynamic-tool',
  } as CherryMessagePart;
}

function respondedPart(approvalId: string): CherryMessagePart {
  return {
    approval: { approved: true, id: approvalId },
    input: {},
    state: 'approval-responded',
    toolCallId: `call-${approvalId}`,
    toolName: 'search',
    type: 'dynamic-tool',
  } as CherryMessagePart;
}

function partStates(message: Message): (string | undefined)[] {
  return (message.data.parts ?? []).map((part) => (part as { state?: string }).state);
}
