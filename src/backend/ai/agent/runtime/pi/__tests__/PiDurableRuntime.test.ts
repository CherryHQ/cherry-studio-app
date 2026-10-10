import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  createRegistry,
  defineDocFamily,
  Harness,
  MemoryStorage,
  ProviderDoc,
  UserEntry,
  type ConversationId,
} from '@earendil-works/pi-durable';

import { PiDurableRuntime } from '../PiDurableRuntime';

function options() {
  return {
    models: createModels({
      authContext: { env: async () => undefined, fileExists: async () => false },
    }),
    registry: createRegistry(),
  };
}

const seed = {
  sessionId: 'business-session',
  revision: 0,
  agent: { instructions: 'Continue the conversation.' },
  entries: [
    {
      kind: UserEntry.kind,
      model: [{ role: 'user' as const, content: 'Remember the blue theme.', timestamp: 1 }],
    },
  ],
};

describe('PiDurableRuntime identity and handoff', () => {
  test('refuses the earlier authoritative binding and preserves its history for explicit migration', async () => {
    class ReopenableStorage extends MemoryStorage {
      override async close() {}
    }
    const storage = new ReopenableStorage();
    const oldBinding = defineDocFamily<{ conversationId: ConversationId | null }, null>({
      kind: 'cherry.session',
      version: 1,
      scope: 'session',
      family: true,
      initial: () => ({ conversationId: null }),
    });
    const old = await Harness.open(storage, options(), BACKGROUND_CONTEXT);
    const id = await old.commit(async (tx) => {
      const binding = await tx.doc(oldBinding, seed.sessionId, null);
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } });
      await tx.appendEntry(conversation.id, seed.entries[0]!);
      binding.conversationId = conversation.id;
      return conversation.id;
    }, BACKGROUND_CONTEXT);
    await old.close(BACKGROUND_CONTEXT);
    const runtime = await PiDurableRuntime.open(storage, options());
    try {
      await expect(runtime.sessions()).rejects.toThrow('predates Cherry-owned transcripts');
      const history = await storage.scanEntries(
        { conversationId: id },
        10,
        undefined,
        BACKGROUND_CONTEXT,
      );
      expect(history.items[0]?.model).toEqual(seed.entries[0]?.model);
    } finally {
      await runtime.close();
    }
  });

  test('history correlation scans each source once and follows later native submission commits', async () => {
    const storage = new MemoryStorage();
    const runtime = await PiDurableRuntime.open(storage, options());
    try {
      const conversation = await runtime.ensureConversation(seed);
      const scan = jest.spyOn(storage, 'scanSubmissions');
      await runtime.history(seed.sessionId, 1);
      const metadata = { userMessageId: 'user', assistantMessageId: 'assistant' };
      const input = await runtime.submit(
        seed.sessionId,
        { type: 'input', requestId: 'new', content: 'Continue' },
        metadata,
      );
      const record = await input.wait(BACKGROUND_CONTEXT);
      const history = await runtime.history(seed.sessionId, 256);
      expect(history.submissions).toContainEqual({ record, metadata });
      await runtime.history(seed.sessionId, 1);
      expect(
        scan.mock.calls.filter(([query]) => query.conversationId === conversation.id),
      ).toHaveLength(1);
      expect(await runtime.withdrawInput(seed.sessionId, 'new')).toBe('settled');
      expect(await runtime.withdrawInput(seed.sessionId, 'missing')).toBe('not_found');
      expect(await runtime.sessions()).toEqual([
        { sessionId: seed.sessionId, binding: await runtime.binding(seed.sessionId) },
      ]);
    } finally {
      await runtime.close();
    }
  });

  test('native admission deduplicates retries and keeps immutable display identities', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    const metadata = { userMessageId: 'user', assistantMessageId: 'assistant', version: 1 };
    const draft = { type: 'input' as const, requestId: 'request', content: 'Continue' };
    try {
      await runtime.ensureConversation(seed);
      const [first, repeated] = await Promise.all([
        runtime.submit(seed.sessionId, draft, metadata),
        runtime.submit(seed.sessionId, draft, {
          version: 1,
          assistantMessageId: 'assistant',
          userMessageId: 'user',
        }),
      ]);
      expect(first.id).toBe(repeated.id);
      const record = await first.wait(BACKGROUND_CONTEXT);
      expect(record.status).toBe('unanswered'); // No model is registered in this storage-only fixture.
      if (record.entry === undefined) throw new Error('Expected a durably placed user input');
      expect(await runtime.submissionMetadata(record)).toEqual(metadata);
      await expect(
        runtime.submit(seed.sessionId, draft, { ...metadata, userMessageId: 'different-user' }),
      ).rejects.toThrow('different display metadata');
      const sourceHistory = await runtime.history(seed.sessionId, 256);
      expect(sourceHistory.entries.filter((entry) => entry.kind === UserEntry.kind)).toHaveLength(
        2,
      );
    } finally {
      await runtime.close();
    }
  });

  test('reset changes model context while full history remains available and paginates without loss', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const conversation = await runtime.ensureConversation(seed);
      await runtime.reset(seed.sessionId, 'Start a fresh subject.');
      expect((await conversation.context(BACKGROUND_CONTEXT)).messages).toEqual([
        expect.objectContaining({ content: 'Start a fresh subject.' }),
      ]);
      const first = await runtime.history(seed.sessionId, 1);
      expect(first.next).toBeDefined();
      const second = await runtime.history(seed.sessionId, 1, first.next);
      expect(second.entries).toEqual([
        expect.objectContaining({ kind: UserEntry.kind, model: seed.entries[0]?.model }),
      ]);
      expect(second.next).toBeUndefined();
    } finally {
      await runtime.close();
    }
  });

  test('request options survive reconfiguration without persisting credentials', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const source = await runtime.ensureConversation(seed);
      const selected = { maxOutputTokens: 512, temperature: 0.3, apiKey: 'must-not-persist' };
      await runtime.configure(seed.sessionId, seed.agent, selected);
      const affinity = await source.commit(
        async (tx) => (await tx.doc(ProviderDoc, source.id)).sessionId,
        BACKGROUND_CONTEXT,
      );
      expect(await runtime.requestOptions(affinity)).toEqual({
        maxOutputTokens: 512,
        temperature: 0.3,
      });
      await expect(runtime.requestOptions('unknown-affinity')).rejects.toThrow(
        'no application configuration',
      );
    } finally {
      await runtime.close();
    }
  });

  test('concurrent continuation creates one conversation and imports history once without execution', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const [first, second] = await Promise.all([
        runtime.ensureConversation(seed),
        runtime.ensureConversation(seed),
      ]);
      expect(first.id).toBe(second.id);
      const history = await first.context(BACKGROUND_CONTEXT);
      expect(history.messages).toEqual(seed.entries[0]?.model);
      expect(await runtime.binding(seed.sessionId)).toMatchObject({
        conversationId: first.id,
        revision: seed.revision,
      });
      expect(await runtime.inspect()).toMatchObject({
        scheduling: 'paused',
        tasks: [],
        submissions: [],
      });
    } finally {
      await runtime.close();
    }
  });

  test('failed creation leaves no binding or imported history and can be retried', async () => {
    let fail = true;
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), {
      ...options(),
      conversationCreated: () => {
        if (fail) throw new Error('preparation failed');
      },
    });
    try {
      await expect(runtime.ensureConversation(seed)).rejects.toThrow('preparation failed');
      expect(await runtime.binding(seed.sessionId)).toBeUndefined();
      fail = false;
      const conversation = await runtime.ensureConversation(seed);
      const history = await conversation.context(BACKGROUND_CONTEXT);
      expect(history.messages).toEqual(seed.entries[0]?.model);
    } finally {
      await runtime.close();
    }
  });

  test('retiring a working copy allows a fresh revision without inheriting deleted history', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const first = await runtime.ensureConversation(seed);
      await runtime.retireSession(seed.sessionId);
      expect(await runtime.conversation(seed.sessionId)).toBeUndefined();
      const rebuilt = await runtime.ensureConversation({ ...seed, revision: 1, entries: [] });
      expect(rebuilt.id).not.toBe(first.id);
      expect((await rebuilt.context(BACKGROUND_CONTEXT)).messages).toEqual([]);
      expect(await runtime.binding(seed.sessionId)).toMatchObject({ revision: 1 });
      await expect(runtime.ensureConversation(seed)).rejects.toThrow('obsolete');
    } finally {
      await runtime.close();
    }
  });
});
