import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { messageTable } from '@/backend/data/db/schemas/message';
import { paintingTable } from '@/backend/data/db/schemas/painting';

import { messageService } from '../MessageService';
import { paintingService } from '../PaintingService';
// Importing the singleton is also what registers `TopicService` in the data
// service registry, which is how `MessageService` reaches it without closing an
// import cycle.
import { topicService } from '../TopicService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

// `fractional-indexing` is ESM-only and outside jest's transform allowlist, so
// importing the real TopicService fails to parse without this. Appending to the
// previous key keeps the "last" insert lexicographically greatest, which is all
// topic creation asks of it.
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

/**
 * Leg 4 of the four-legged model in docs/references/lifecycle/resource-scope.md.
 *
 * `ResourceScopeCoordinator` cancels work before a deletion, but only while the
 * process lives — iOS and Android kill apps without running any teardown, and a
 * handler force-finalized past its grace window can still be running in memory.
 * So the last line of defence is the write path itself:
 *
 * **a write targeting a deleted resource must fail or no-op, never resurrect it.**
 *
 * That holds today, but not for the reason the design assumed. Topics and
 * messages are *hard*-deleted — `deletedAt` exists on both tables and is never
 * written; only assistants are soft-deleted. So what stops a late write is the
 * cascade: deleting a topic removes its message rows, and every write either
 * re-checks the topic, re-checks its own row, or matches nothing. None of that
 * was pinned by a test, which means any edit to a WHERE clause could have
 * removed it silently. These are those pins.
 */
describe('writes against a deleted resource', () => {
  let sqlite: DatabaseSync;
  let db: TestDb;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    db = createTestDb(sqlite);
    await installTestHost({ DbService: db.dbService });
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  const countMessages = async () => (await db.database.select().from(messageTable)).length;

  async function seedTurn() {
    const topic = await topicService.create({ name: 'guarded' });
    const user = await messageService.create(topic.id, {
      data: { parts: [{ text: 'hi', type: 'text' }] },
      role: 'user',
    });
    const assistant = await messageService.create(topic.id, {
      data: { parts: [] },
      role: 'assistant',
      status: 'pending',
    });
    return { assistant, topic, user };
  }

  describe('after its topic is deleted', () => {
    it('refuses to reserve a new turn', async () => {
      const { topic } = await seedTurn();
      await topicService.delete(topic.id);

      await expect(
        messageService.createUserMessageWithPlaceholders({
          placeholders: [{ data: { parts: [] }, role: 'assistant' }],
          topicId: topic.id,
          userMessage: { dto: { data: { parts: [] }, role: 'user' }, mode: 'create' },
        }),
      ).rejects.toThrow();

      expect(await countMessages()).toBe(0);
    });

    it('refuses to land a turn’s terminal write', async () => {
      const { assistant, topic } = await seedTurn();
      await topicService.delete(topic.id);

      // The exact write a cancelled-but-still-finishing turn attempts.
      await expect(
        messageService.finalizeAssistantMessage(assistant.id, {
          data: { parts: [{ text: 'late reply', type: 'text' }] },
          status: 'success',
        }),
      ).rejects.toThrow();

      expect(await countMessages()).toBe(0);
    });

    it('refuses to update a message', async () => {
      const { assistant, topic } = await seedTurn();
      await topicService.delete(topic.id);

      await expect(
        messageService.update(assistant.id, { data: { parts: [{ text: 'x', type: 'text' }] } }),
      ).rejects.toThrow();

      expect(await countMessages()).toBe(0);
    });

    it('refuses to branch a new sibling off a deleted message', async () => {
      const { assistant, topic } = await seedTurn();
      await topicService.delete(topic.id);

      await expect(
        messageService.createSibling(assistant.id, { parts: [{ text: 'x', type: 'text' }] }),
      ).rejects.toThrow();

      expect(await countMessages()).toBe(0);
    });

    // These two write by id without re-reading anything, so they cannot fail —
    // they match zero rows instead. That is the other half of the contract, and
    // it only holds while the delete stays a hard one: a tombstoned message row
    // would make both of them silently write into a deleted topic.
    it('no-ops the sibling-group backfill without resurrecting the row', async () => {
      const { assistant, topic } = await seedTurn();
      await topicService.delete(topic.id);

      await expect(messageService.updateSiblingsGroupId(assistant.id, 42)).resolves.toBeUndefined();
      expect(await countMessages()).toBe(0);
    });

    it('no-ops the cold-start crash sweep without resurrecting the row', async () => {
      const { assistant, topic } = await seedTurn();
      await topicService.delete(topic.id);

      await expect(messageService.settleCrashedMessages([assistant.id])).resolves.toBeUndefined();
      expect(await countMessages()).toBe(0);
    });
  });

  describe('after its painting is deleted', () => {
    it('refuses to persist generated outputs onto a deleted receipt', async () => {
      const painting = await paintingService.create({
        modelId: 'openai::image-1',
        prompt: 'draw',
        providerId: 'openai',
      });
      await paintingService.deleteMany([painting.id]);

      // What the painting.generate handler does once the provider returns — the
      // window where the job was force-finalized but the handler still runs.
      await expect(paintingService.replaceOutputs(painting.id, [])).rejects.toThrow();

      expect(await db.database.select().from(paintingTable)).toHaveLength(0);
    });
  });
});
