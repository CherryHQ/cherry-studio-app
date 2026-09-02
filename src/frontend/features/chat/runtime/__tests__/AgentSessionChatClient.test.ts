import type {
  AgentEvent,
  AgentMessageView,
  AgentProtocol,
  AgentSessionObservation,
  AgentSessionSnapshot,
} from '@/shared/contracts/agent';

import { AgentSessionChatClient } from '../AgentSessionChatClient';

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function snapshot(): AgentSessionSnapshot {
  return {
    activeTurn: null,
    activeUserMessage: null,
    agent: { id: 'agent-1', name: 'Agent' },
    capabilities: { approvals: true, attachments: false, reasoning: true, tools: true },
    pendingApprovals: [],
    hasHistoryBeforeActiveTurn: null,
    session: {
      agentId: 'agent-1',
      createdAt: '2026-08-25T00:00:00.000Z',
      executionTarget: { kind: 'local' },
      forkBoundaryMessageId: null,
      forkedFromSessionId: null,
      id: 'session-1',
      title: '',
      titleIsManual: false,
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
    streamingMessage: null,
  };
}

function userMessage(): AgentMessageView {
  return {
    createdAt: '2026-08-25T00:00:00.000Z',
    id: 'user-1',
    parts: [{ id: 'input-0', state: 'done', text: 'Hello', type: 'text' }],
    role: 'user',
    sessionId: 'session-1',
    status: 'success',
    turnId: 'turn-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
    usage: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

function assistantMessage(): AgentMessageView {
  return {
    createdAt: '2026-08-25T00:00:00.000Z',
    id: 'assistant-1',
    parts: [{ id: 'text-1', state: 'streaming', text: '', type: 'text' }],
    role: 'assistant',
    sessionId: 'session-1',
    status: 'streaming',
    turnId: 'turn-1',
    updatedAt: '2026-08-25T00:00:00.000Z',
    usage: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

function protocolWithObservation(
  observeSession: AgentProtocol['observeSession'],
): jest.Mocked<AgentProtocol> {
  return {
    cancelTurn: jest.fn(),
    deleteSession: jest.fn(),
    forkSession: jest.fn(),
    observeSession: jest.fn(observeSession),
    renameSession: jest.fn(),
    respondApproval: jest.fn(),
    startSession: jest.fn(),
    submitMessage: jest.fn(),
  };
}

describe('AgentSessionChatClient', () => {
  test('starts a durable Session without leaving an ownerless observation before navigation', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    protocol.startSession.mockResolvedValue(snapshot().session);
    const client = new AgentSessionChatClient(protocol);

    await client.startSession('agent-1', [{ text: 'Hello', type: 'text' }]);

    expect(protocol.startSession).toHaveBeenCalledWith({
      agentId: 'agent-1',
      executionTarget: { kind: 'local' },
      parts: [{ text: 'Hello', type: 'text' }],
    });
    expect(protocol.observeSession).not.toHaveBeenCalled();
  });

  test('keeps an admitted Draft submission independent from destination observation', async () => {
    const protocol = protocolWithObservation(async () => {
      throw new Error('observation unavailable');
    });
    protocol.startSession.mockResolvedValue(snapshot().session);
    const client = new AgentSessionChatClient(protocol);

    await expect(
      client.startSession('agent-1', [{ text: 'Hello', type: 'text' }]),
    ).resolves.toEqual(snapshot().session);
    expect(protocol.observeSession).not.toHaveBeenCalled();
  });

  test('forwards composer turn overrides with the submitted message', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    const client = new AgentSessionChatClient(protocol);

    await client.submitMessage('session-1', [{ text: 'Hello', type: 'text' }], {
      modelId: 'provider::model-b',
      reasoningEffort: 'high',
    });

    expect(protocol.submitMessage).toHaveBeenCalledWith({
      modelId: 'provider::model-b',
      parts: [{ text: 'Hello', type: 'text' }],
      reasoningEffort: 'high',
      sessionId: 'session-1',
    });
  });

  test('applies events emitted after subscription but before the snapshot promise resolves', async () => {
    const observation = deferred<AgentSessionObservation>();
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return observation.promise;
    });
    const client = new AgentSessionChatClient(protocol);

    const observing = client.observe('session-1');
    listener?.({ type: 'message.created', message: assistantMessage() });
    listener?.({
      type: 'message.delta',
      messageId: 'assistant-1',
      delta: { op: 'text.append', partId: 'text-1', text: 'Hello' },
    });
    observation.resolve({ snapshot: snapshot(), unsubscribe: jest.fn() });
    await observing;

    expect(client.getState('session-1')).toMatchObject({
      liveMessages: [
        {
          id: 'assistant-1',
          parts: [{ id: 'text-1', state: 'streaming', text: 'Hello', type: 'text' }],
        },
      ],
      status: 'ready',
    });
  });

  test('invalidates the durable transcript after installing a fresh observation snapshot', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    const onTranscriptChanged = jest.fn();
    const client = new AgentSessionChatClient(protocol, { onTranscriptChanged });

    await client.observe('session-1');

    expect(onTranscriptChanged).toHaveBeenCalledWith('session-1');
  });

  test('invalidates Session queries when a user message advances conversation activity', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const onSessionChanged = jest.fn();
    const client = new AgentSessionChatClient(protocol, { onSessionChanged });
    await client.observe('session-1');

    listener?.({ type: 'message.created', message: userMessage() });
    listener?.({ type: 'message.created', message: assistantMessage() });

    expect(onSessionChanged).toHaveBeenCalledTimes(1);
    expect(onSessionChanged).toHaveBeenCalledWith('session-1');
  });

  test('cancels the active turn with the correlated session and turn ids', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    listener?.({
      type: 'turn.updated',
      turn: {
        assistantMessageId: 'assistant-1',
        endedAt: null,
        error: null,
        id: 'turn-1',
        sessionId: 'session-1',
        startedAt: '2026-08-25T00:00:00.000Z',
        status: 'running',
      },
    });

    await client.cancelTurn('session-1');

    expect(protocol.cancelTurn).toHaveBeenCalledWith({
      sessionId: 'session-1',
      turnId: 'turn-1',
    });
  });

  test('unsubscribes the Host observation when the final React subscriber leaves', async () => {
    const unsubscribe = jest.fn();
    const protocol = protocolWithObservation(async () => ({ snapshot: snapshot(), unsubscribe }));
    const client = new AgentSessionChatClient(protocol);
    const release = client.subscribe('session-1', jest.fn());
    await client.observe('session-1');

    release();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.getState('session-1')).toMatchObject({ liveMessages: [], status: 'idle' });
  });

  test('coalesces consecutive text deltas into one live-message notification', async () => {
    jest.useFakeTimers();
    let release = () => {};
    try {
      let listener: ((event: AgentEvent) => void) | undefined;
      const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
        listener = nextListener;
        return { snapshot: snapshot(), unsubscribe: jest.fn() };
      });
      const client = new AgentSessionChatClient(protocol);
      await client.observe('session-1');
      const onChange = jest.fn();
      release = client.subscribe('session-1', onChange);
      listener?.({ type: 'message.created', message: assistantMessage() });
      onChange.mockClear();

      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: { op: 'text.append', partId: 'text-1', text: 'Hello' },
      });
      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: { op: 'text.append', partId: 'text-1', text: ' world' },
      });

      expect(onChange).not.toHaveBeenCalled();
      jest.advanceTimersByTime(16);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(client.getState('session-1').liveMessages[0]?.parts).toEqual([
        { id: 'text-1', state: 'streaming', text: 'Hello world', type: 'text' },
      ]);
    } finally {
      release();
      jest.useRealTimers();
    }
  });

  test('publishes a terminal message immediately and cancels its pending text flush', async () => {
    jest.useFakeTimers();
    let release = () => {};
    try {
      let listener: ((event: AgentEvent) => void) | undefined;
      const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
        listener = nextListener;
        return { snapshot: snapshot(), unsubscribe: jest.fn() };
      });
      const client = new AgentSessionChatClient(protocol);
      await client.observe('session-1');
      const onChange = jest.fn();
      release = client.subscribe('session-1', onChange);
      listener?.({ type: 'message.created', message: assistantMessage() });
      onChange.mockClear();
      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: { op: 'text.append', partId: 'text-1', text: 'Partial' },
      });
      listener?.({
        type: 'message.finalized',
        message: {
          ...assistantMessage(),
          parts: [{ id: 'text-1', state: 'done', text: 'Complete', type: 'text' }],
          status: 'success',
        },
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(client.getState('session-1').liveMessages[0]).toMatchObject({
        parts: [{ text: 'Complete' }],
        status: 'success',
      });
      jest.advanceTimersByTime(16);
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      release();
      jest.useRealTimers();
    }
  });

  test('drops terminal live copies once the durable transcript contains the same versions', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const finalizedAssistant = {
      ...assistantMessage(),
      parts: [{ id: 'text-1', state: 'done' as const, text: 'Hello', type: 'text' as const }],
      status: 'success' as const,
      updatedAt: '2026-08-25T00:00:01.000Z',
    };
    listener?.({ type: 'message.created', message: userMessage() });
    listener?.({ type: 'message.created', message: assistantMessage() });
    listener?.({ type: 'message.finalized', message: finalizedAssistant });

    client.reconcilePersistedMessages('session-1', [userMessage(), finalizedAssistant]);

    expect(client.getState('session-1').liveMessages).toEqual([]);
  });

  test('applies Session title events and invalidates Session queries', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const onSessionChanged = jest.fn();
    const client = new AgentSessionChatClient(protocol, { onSessionChanged });
    await client.observe('session-1');

    listener?.({
      type: 'session.updated',
      session: { ...snapshot().session, title: 'Lunar eclipses' },
    });

    expect(client.getState('session-1').snapshot?.session.title).toBe('Lunar eclipses');
    expect(onSessionChanged).toHaveBeenCalledWith('session-1');
  });

  test('rejects an explicit observation after exposing its error state', async () => {
    const protocol = protocolWithObservation(async () => {
      throw new Error('observation failed');
    });
    const client = new AgentSessionChatClient(protocol);

    await expect(client.observe('session-1')).rejects.toThrow('observation failed');

    expect(client.getState('session-1')).toMatchObject({
      error: new Error('observation failed'),
      status: 'error',
    });
  });
});
