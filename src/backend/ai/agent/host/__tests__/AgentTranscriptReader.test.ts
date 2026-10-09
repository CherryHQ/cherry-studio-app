import type { AgentMessageView, AgentSessionView } from '@/shared/contracts/agent';

import type { DurableAgentRuntime, RuntimeDurableTurn } from '../../runtime';
import type { AgentSessionStore } from '../../sessionStore/AgentSessionStore';
import { AgentTranscriptReader } from '../AgentTranscriptReader';

const session: AgentSessionView = {
  id: 'session',
  agentId: 'agent',
  executionTarget: { kind: 'local' },
  title: 'Continued',
  titleIsManual: false,
  forkedFromSessionId: null,
  forkBoundaryMessageId: null,
  createdAt: new Date(1).toISOString(),
  updatedAt: new Date(4).toISOString(),
};
function turn(id: string, boundary: number): RuntimeDurableTurn {
  return {
    identity: { sessionId: session.id, turnId: id, requestId: id },
    userMessageId: `${id}-u`,
    assistantMessageId: `${id}-a`,
    inputBoundary: `pi:${boundary}`,
    answerBoundary: `pi:${boundary + 1}`,
    createdAt: boundary,
    updatedAt: boundary + 1,
    status: 'completed',
    hasAssistant: true,
    usage: null,
    error: null,
    parts: [{ id: `${id}-text`, type: 'text', text: `Answer ${id}`, state: 'done' }],
    metadata: {
      userParts: [{ id: `${id}-input`, type: 'text', text: `Question ${id}`, state: 'done' }],
      referencedFileEntryIds: [],
      hasHistoryBeforeActiveTurn: true,
      inferenceSnapshot: {
        version: 1,
        model: {
          uniqueModelId: 'provider::model',
          providerId: 'provider',
          modelId: 'model',
          apiModelId: 'model',
          name: 'Model',
        },
        parameters: {},
        tools: [],
      },
    },
  };
}
function fixture() {
  const turns = [turn('new', 20), turn('previous', 10)];
  const legacy: AgentMessageView[] = [
    {
      id: 'old-a',
      sessionId: 'old-source',
      turnId: 'old',
      role: 'assistant',
      status: 'success',
      parts: [{ id: 'old-text', type: 'text', text: 'Original old answer', state: 'done' }],
      usage: null,
      stats: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: new Date(2).toISOString(),
      updatedAt: new Date(2).toISOString(),
    },
    {
      id: 'old-u',
      sessionId: 'old-source',
      turnId: 'old',
      role: 'user',
      status: 'success',
      parts: [{ id: 'old-input', type: 'text', text: 'Original old question', state: 'done' }],
      usage: null,
      stats: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    },
  ];
  const runtime = {
    conversationInfo: async () => ({
      metadata: {},
      legacy: { sourceSessionId: 'old-source', throughMessageId: 'old-a' },
    }),
    history: async (_sessionId: string, query: { limit: number; cursor?: string }) => ({
      turns: turns
        .filter(
          (value) =>
            !query.cursor || Number(value.inputBoundary!.slice(3)) <= Number(query.cursor.slice(3)),
        )
        .slice(0, query.limit),
    }),
    message: async (_sessionId: string, id: string) => {
      const value = turns.find(
        (value) => value.userMessageId === id || value.assistantMessageId === id,
      );
      return value
        ? { turn: value, role: value.userMessageId === id ? 'user' : 'assistant' }
        : undefined;
    },
  } as unknown as DurableAgentRuntime;
  const listByCursor = jest.fn(
    async (_source: string, query = {} as { cursor?: string; ids?: string[]; limit?: number }) => ({
      items: legacy
        .filter(
          (message) =>
            (!query.ids || query.ids.includes(message.id)) &&
            (!query.cursor || Date.parse(message.createdAt) < Number(query.cursor.split(':')[0])),
        )
        .slice(0, query.limit),
    }),
  );
  const store = {
    getSession: async () => session,
    getDurableRuntimeTimings: async () => new Map(),
  } as unknown as AgentSessionStore;
  const reader = new AgentTranscriptReader(
    () => runtime,
    () => [],
    store,
    { getAgent: async () => null },
    { listByCursor, readSelection: jest.fn() },
  );
  return { reader, listByCursor };
}

describe('Pi history and the fixed legacy display prefix', () => {
  test('an older cursor can split a native turn and then continue into the original SQL prefix', async () => {
    const { reader, listByCursor } = fixture();
    const first = await reader.listByCursor(session.id, { limit: 3 });
    expect(first.items.map((message) => message.id)).toEqual(['new-a', 'new-u', 'previous-a']);
    const next = await reader.listByCursor(session.id, { limit: 3, cursor: first.nextCursor });
    expect(next.items.map((message) => message.id)).toEqual(['previous-u', 'old-a', 'old-u']);
    expect(next.items.every((message) => message.sessionId === session.id)).toBe(true);
    expect(listByCursor).toHaveBeenCalledWith('old-source', expect.anything(), 'old-a');
  });

  test('around limit one contains only its selected target', async () => {
    const { reader } = fixture();
    const page = await reader.listByCursor(session.id, { aroundMessageId: 'previous-u', limit: 1 });
    expect(page.items.map((message) => message.id)).toEqual(['previous-u']);
  });

  test('newer pagination and selected export retain native and legacy ordering', async () => {
    const { reader } = fixture();
    const page = await reader.listByCursor(session.id, { limit: 3 });
    const older = await reader.listByCursor(session.id, { limit: 3, cursor: page.nextCursor });
    const newer = await reader.listByCursor(session.id, {
      limit: 3,
      cursor: older.previousCursor,
      direction: 'newer',
    });
    expect(newer.items.map((message) => message.id)).toEqual(['new-a', 'new-u', 'previous-a']);
    const selected = await reader.readSelection(session.id, ['old-u', 'new-a']);
    expect(selected.messages.map((message) => message.id)).toEqual(['old-u', 'new-a']);
  });
});
