import { readFileSync } from 'node:fs';

import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  createRegistry,
  GenerationTask,
  Harness,
  InboxDoc,
  LiveDoc,
  MemoryStorage,
  UserEntry,
} from '@earendil-works/pi-durable';

test('registered pi-durable patch delivers the held-input contract', () => {
  const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
  const patchPath = 'patches/@earendil-works__pi-durable@1.5.0.patch';
  const patch = readFileSync(patchPath, 'utf8');
  const installed = JSON.parse(
    readFileSync('node_modules/@earendil-works/pi-durable/package.json', 'utf8'),
  );
  expect(workspace).toContain(patchPath);
  expect(installed.version).toBe('1.5.0');
  expect(patch).toContain('keepQueuedInputs');
  expect(patch).toContain('expectedInput');
  expect(patch).toContain('item.held');
});

test('real Harness keeps queued input when aborting the live input', async () => {
  const h = await Harness.open(
    new MemoryStorage(),
    {
      models: createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
      }),
      registry: createRegistry(),
    },
    context,
  );
  try {
    const c = await h.createConversation({ ownership: { kind: 'ownerless' } }, context);
    const { a, b } = await c.commit(async (tx) => {
      const live = await tx.doc(LiveDoc, c.id);
      const inbox = await tx.doc(InboxDoc, c.id);
      const entry = await tx.appendEntry(UserEntry, c.id, {
        model: [{ role: 'user', content: 'A', timestamp: 1 }],
      });
      const a = await tx.createSubmission({
        conversationId: c.id,
        type: 'input',
        requestId: 'A',
        status: 'placed',
        entry: entry.id,
      });
      const taskId = await tx.createTask(
        GenerationTask,
        {},
        { ownership: { kind: 'conversation' }, conversationId: c.id },
      );
      live.run = { taskId, inputs: [a.id], turns: 0 };
      const b = await tx.createSubmission({
        conversationId: c.id,
        type: 'input',
        requestId: 'B',
        status: 'queued',
      });
      inbox.items.push({ id: b.id, mode: 'followUp', content: 'B' });
      return { a: a.id, b: b.id };
    }, context);
    await c.abort(context, { background: true, keepQueuedInputs: true, expectedInput: a });
    const record = await (await h.submission(b, context))!.status(context);
    expect(record.status).toBe('queued');
    expect(record.entry).toBeUndefined();
  } finally {
    await h.close(context);
  }
});

test.each(['settled', 'other conversation', 'outside live run'] as const)(
  'expectedInput guard ignores %s while another run is active',
  async (mismatch) => {
    const h = await Harness.open(
      new MemoryStorage(),
      {
        models: createModels({
          authContext: { env: async () => undefined, fileExists: async () => false },
        }),
        registry: createRegistry(),
      },
      context,
    );
    try {
      const c = await h.createConversation({ ownership: { kind: 'ownerless' } }, context);
      const other = await h.createConversation({ ownership: { kind: 'ownerless' } }, context);
      const ids = await c.commit(async (tx) => {
        const live = await tx.doc(LiveDoc, c.id);
        const inbox = await tx.doc(InboxDoc, c.id);
        const entry = await tx.appendEntry(UserEntry, c.id, {
          model: [{ role: 'user', content: 'active', timestamp: 1 }],
        });
        const active = await tx.createSubmission({
          conversationId: c.id,
          type: 'input',
          status: 'placed',
          entry: entry.id,
        });
        const taskId = await tx.createTask(
          GenerationTask,
          {},
          { ownership: { kind: 'conversation' }, conversationId: c.id },
        );
        live.run = { taskId, inputs: [active.id], turns: 0 };
        const invalid = await tx.createSubmission(
          mismatch === 'settled'
            ? {
                conversationId: c.id,
                type: 'input',
                status: 'done',
                entry: entry.id,
                answer: entry.id,
              }
            : {
                conversationId: mismatch === 'other conversation' ? other.id : c.id,
                type: 'input',
                status: 'placed',
                entry: entry.id,
              },
        );
        const waiting = await tx.createSubmission({
          conversationId: c.id,
          type: 'input',
          status: 'queued',
        });
        inbox.items.push({ id: waiting.id, mode: 'followUp', content: 'waiting' });
        return { invalid: invalid.id, waiting: waiting.id, taskId };
      }, context);
      await c.abort(context, {
        background: true,
        keepQueuedInputs: true,
        expectedInput: ids.invalid,
      });
      expect(await (await h.submission(ids.waiting, context))!.status(context)).toMatchObject({
        status: 'queued',
      });
      const live = await h.snapshot(LiveDoc, c.id, context);
      expect(live?.run?.taskId).toBe(ids.taskId);
      const inbox = await h.snapshot(InboxDoc, c.id, context);
      expect(inbox?.items).toMatchObject([{ content: 'waiting' }]);
      expect(inbox?.items[0]).not.toHaveProperty('held');
    } finally {
      await h.close(context);
    }
  },
);
