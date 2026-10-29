import type {
  AgentEvent,
  AgentMessageView,
  AgentProtocol,
  AgentSessionObservation,
  AgentSessionSnapshot,
  AgentTurnView,
} from '@/shared/contracts/agent';
import { AgentProtocolError } from '@/shared/contracts/agent';

import { AgentSessionChatClient, isAgentSessionBusy } from '../AgentSessionChatClient';

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
    queuedInputs: [],
    activeUserMessage: null,
    agent: { id: 'agent-1', name: 'Agent' },
    capabilities: { approvals: true, attachments: false, reasoning: true, tools: true },
    pendingApprovals: [],
    pendingQuestion: null,
    hasHistoryBeforeActiveTurn: null,
    session: {
      agentId: 'agent-1',
      createdAt: '2026-08-25T00:00:00.000Z',
      forkBoundaryMessageId: null,
      forkedFromSessionId: null,
      id: 'session-1',
      name: '',
      isNameManuallyEdited: false,
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
    streamingMessage: null,
  };
}

test('observes a removable queue without inventing an active execution and reconciles placement races', async () => {
  const queued = {
    turnId: 'waiting',
    userMessage: { ...userMessage(), id: 'waiting-user', turnId: 'waiting' },
    assistantMessageId: 'waiting-answer',
  };
  let listener: ((event: AgentEvent) => void) | undefined;
  let current: AgentSessionSnapshot = { ...snapshot(), queuedInputs: [queued] };
  const protocol = protocolWithObservation(
    jest.fn(async (_sessionId: string, next: (event: AgentEvent) => void) => {
      listener = next;
      return { snapshot: current, unsubscribe() {} };
    }),
  );
  const client = new AgentSessionChatClient(protocol);
  const unsubscribe = client.subscribe('session-1', () => {});
  try {
    await client.observe('session-1');
    expect(client.getState('session-1').activeTurn).toBeNull();
    expect(client.getState('session-1').queuedInputs).toEqual([queued]);
    expect(client.getState('session-1').liveMessages).toEqual([]);
    expect(isAgentSessionBusy(client.getState('session-1'))).toBe(true);
    listener!({ type: 'queue.updated', inputs: [] });
    expect(isAgentSessionBusy(client.getState('session-1'))).toBe(false);
    const active: AgentTurnView = {
      id: 'waiting',
      sessionId: 'session-1',
      assistantMessageId: 'waiting-answer',
      status: 'running',
      startedAt: '2026-10-16T00:00:00.000Z',
      endedAt: null,
      error: null,
    };
    current = { ...snapshot(), activeTurn: active, queuedInputs: [] };
    protocol.cancelQueuedInput.mockResolvedValueOnce('already-started');
    await expect(client.cancelQueuedInput('session-1', 'waiting')).resolves.toBe('already-started');
    expect(client.getState('session-1').activeTurn).toEqual(active);
    expect(protocol.cancelTurn).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
    client.dispose();
  }
});

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
    stats: null,
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
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

function protocolWithObservation(
  observeSession: AgentProtocol['observeSession'],
): jest.Mocked<AgentProtocol> {
  return {
    cancelSubmission: jest.fn(),
    cancelTurn: jest.fn(),
    cancelQueuedInput: jest.fn<
      ReturnType<AgentProtocol['cancelQueuedInput']>,
      Parameters<AgentProtocol['cancelQueuedInput']>
    >(async () => 'withdrawn'),
    clearWorkingStorage: jest.fn(),
    deleteSession: jest.fn(),
    deleteTurn: jest.fn(),
    editUserMessage: jest.fn(),
    forkSession: jest.fn(),
    retryMessage: jest.fn(),
    selectMessage: jest.fn(),
    getWorkingStorageSize: jest.fn(),
    getSessionStatus: jest.fn<
      ReturnType<AgentProtocol['getSessionStatus']>,
      Parameters<AgentProtocol['getSessionStatus']>
    >(() => null),
    subscribeSessionStatus: jest.fn<
      ReturnType<AgentProtocol['subscribeSessionStatus']>,
      Parameters<AgentProtocol['subscribeSessionStatus']>
    >(() => () => undefined),
    observeSession: jest.fn(observeSession),
    renameSession: jest.fn(),
    respondApproval: jest.fn(),
    respondQuestion: jest.fn(),
    startSession: jest.fn(),
    submitMessage: jest.fn(),
  };
}

async function waitForCall(mock: { mock: { calls: unknown[] } }): Promise<void> {
  for (let attempt = 0; attempt < 20 && mock.mock.calls.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  expect(mock.mock.calls.length).toBeGreaterThan(0);
}

describe('AgentSessionChatClient', () => {
  test('keeps live text on runtime failure and clears the error after refreshing the observation', async () => {
    let publish!: (event: AgentEvent) => void;
    const protocol = protocolWithObservation(async (_id, listener) => {
      publish = listener;
      return {
        snapshot: {
          ...snapshot(),
          contextStatus: 'compacting',
          streamingMessage: assistantMessage(),
        },
        unsubscribe: jest.fn(),
      };
    });
    const client = new AgentSessionChatClient(protocol);
    const release = client.subscribe('session-1', () => undefined);
    await client.observe('session-1');
    expect(client.getState('session-1').contextStatus).toBe('compacting');
    publish({ type: 'context.updated', status: 'compaction-failed' });
    expect(client.getState('session-1').contextStatus).toBe('compaction-failed');
    const messages = client.getState('session-1').liveMessages;
    publish({ type: 'runtime.failed' });
    expect(client.getState('session-1')).toMatchObject({
      status: 'error',
      contextStatus: null,
      liveMessages: messages,
      error: { view: { code: 'EXECUTION_UNAVAILABLE' } },
    });
    await client.refresh('session-1');
    expect(protocol.observeSession).toHaveBeenCalledTimes(2);
    expect(client.getState('session-1')).toMatchObject({
      status: 'ready',
      contextStatus: 'compacting',
    });
    expect(client.getState('session-1').error).toBeUndefined();
    release();
    client.dispose();
  });

  test('admits a follow-up without replacing the streaming turn and keeps retries blocked', async () => {
    const activeTurn = {
      id: 'turn-1',
      sessionId: 'session-1',
      status: 'running' as const,
      assistantMessageId: 'assistant-1',
      startedAt: '2026-08-25T00:00:00.000Z',
      endedAt: null,
      error: null,
    };
    const protocol = protocolWithObservation(async () => ({
      snapshot: { ...snapshot(), activeTurn, streamingMessage: assistantMessage() },
      unsubscribe: jest.fn(),
    }));
    const client = new AgentSessionChatClient(protocol);
    const unsubscribe = client.subscribe('session-1', () => undefined);
    await client.observe('session-1');
    const before = client.getState('session-1');
    await client.submitMessage({
      sessionId: 'session-1',
      userMessageId: 'queued-user',
      assistantMessageId: 'queued-answer',
      parts: [{ type: 'text', text: 'Follow up' }],
    });
    expect(client.getState('session-1').activeTurn).toEqual(activeTurn);
    expect(client.getState('session-1').liveMessages).toEqual(before.liveMessages);
    expect(isAgentSessionBusy(client.getState('session-1'))).toBe(true);
    await expect(
      client.retryMessage({ sessionId: 'session-1', messageId: 'assistant-1' }),
    ).rejects.toMatchObject({ view: { code: 'SESSION_BUSY' } });
    expect(protocol.submitMessage).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.dispose();
  });

  test('reobserving restores a completed selected answer beside its running sibling', async () => {
    const first = { ...assistantMessage(), parentId: userMessage().id };
    const second = { ...first, id: 'assistant-2' };
    let current: AgentSessionSnapshot = {
      ...snapshot(),
      session: { ...snapshot().session, activeNodeId: first.id },
      activeUserMessage: userMessage(),
      streamingMessage: first,
      additionalMessages: [second],
    };
    const client = new AgentSessionChatClient(
      protocolWithObservation(async () => ({ snapshot: current, unsubscribe() {} })),
    );
    const release = client.subscribe('session-1', () => {});
    try {
      await client.observe('session-1');
      client.pauseObservedSessions();
      const completed: AgentMessageView = {
        ...first,
        status: 'success',
        parts: [{ id: 'text-1', type: 'text', text: 'Completed answer', state: 'done' }],
      };
      current = { ...current, streamingMessage: second, additionalMessages: [completed] };
      await client.resumeObservedSessions();
      expect(client.getState('session-1').snapshot?.session.activeNodeId).toBe(first.id);
      expect(client.getState('session-1').liveMessages).toEqual([userMessage(), completed, second]);
      expect(isAgentSessionBusy(client.getState('session-1'))).toBe(true);
    } finally {
      release();
      client.dispose();
    }
  });

  test('pauses live observation in background and restores missed text from the next snapshot', async () => {
    let publish!: (event: AgentEvent) => void;
    let snapshotText = 'before';
    const unsubscribeObservation = jest.fn();
    const protocol = protocolWithObservation(async (_sessionId, listener) => {
      publish = listener;
      return {
        snapshot: {
          ...snapshot(),
          streamingMessage: {
            ...assistantMessage(),
            parts: [{ id: 'text-1', state: 'streaming', text: snapshotText, type: 'text' }],
          },
        },
        unsubscribe: unsubscribeObservation,
      };
    });
    const client = new AgentSessionChatClient(protocol);
    const release = client.subscribe('session-1', () => undefined);
    await client.observe('session-1');
    expect(client.getState('session-1').liveMessages[0]?.parts[0]).toMatchObject({
      text: 'before',
    });

    const stalePublish = publish;
    client.pauseObservedSessions();
    expect(unsubscribeObservation).toHaveBeenCalledTimes(1);
    snapshotText = 'before and after';
    stalePublish({
      type: 'message.delta',
      messageId: 'assistant-1',
      delta: { op: 'text.append', partId: 'text-1', text: ' stale' },
    });
    await client.observe('session-1');
    expect(protocol.observeSession).toHaveBeenCalledTimes(1);
    expect(client.getState('session-1').liveMessages[0]?.parts[0]).toMatchObject({
      text: 'before',
    });

    await client.resumeObservedSessions();
    expect(protocol.observeSession).toHaveBeenCalledTimes(2);
    expect(client.getState('session-1').liveMessages[0]?.parts[0]).toMatchObject({
      text: 'before and after',
    });
    release();
  });

  test('restores a live question from observation and rejects responses after it resolves', async () => {
    const question = {
      turnId: 'turn-1',
      toolCallId: 'question-1',
      question: {
        questions: [
          {
            id: 'focus',
            question: 'Choose a focus',
            selection: 'single' as const,
            options: [
              { id: 'a', label: 'Writing' },
              { id: 'b', label: 'Reading' },
            ],
          },
        ],
      },
    };
    let publish!: (event: AgentEvent) => void;
    const protocol = protocolWithObservation(async (_id, listener) => {
      publish = listener;
      return { snapshot: { ...snapshot(), pendingQuestion: question }, unsubscribe: jest.fn() };
    });
    protocol.respondQuestion.mockImplementation(async () => {
      publish({ type: 'question.updated', question: null });
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    expect(client.getState('session-1').pendingQuestion).toEqual(question);
    const answer = {
      answers: [{ questionId: 'focus', selectedOptionIds: ['a'], text: '', skipped: false }],
    };
    await client.respondQuestion('session-1', 'question-1', answer);
    expect(protocol.respondQuestion).toHaveBeenCalledWith({
      sessionId: 'session-1',
      turnId: 'turn-1',
      toolCallId: 'question-1',
      answer,
    });
    expect(client.getState('session-1').pendingQuestion).toBeNull();
    await expect(client.respondQuestion('session-1', 'question-1', answer)).rejects.toThrow();
    expect(protocol.respondQuestion).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  test('rejects a second retry or send during retry admission and releases the guard on failure', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    let rejectRetry!: (error: Error) => void;
    protocol.retryMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRetry = reject;
        }),
    );
    const client = new AgentSessionChatClient(protocol);
    const unsubscribe = client.subscribe('session-1', () => undefined);
    const first = client.retryMessage({ sessionId: 'session-1', messageId: 'assistant-1' });
    const rejected = expect(first).rejects.toThrow('preflight failed');
    await client.observe('session-1');
    await client.refresh('session-1');
    expect(client.getState('session-1').isSubmitting).toBe(true);
    await expect(
      client.retryMessage({ sessionId: 'session-1', messageId: 'assistant-1' }),
    ).rejects.toMatchObject({ view: { code: 'SESSION_BUSY' } });
    await expect(
      client.submitMessage({
        sessionId: 'session-1',
        userMessageId: 'new-user',
        assistantMessageId: 'new-answer',
        parts: [{ type: 'text', text: 'next' }],
      }),
    ).rejects.toMatchObject({ view: { code: 'SESSION_BUSY' } });
    rejectRetry(new Error('preflight failed'));
    await rejected;
    expect(client.getState('session-1').isSubmitting).toBe(false);
    expect(protocol.retryMessage).toHaveBeenCalledTimes(1);
    expect(protocol.submitMessage).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('keeps the original answer visible while a new branch is admitted, across a refresh', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    let admitRetry!: () => void;
    protocol.retryMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          admitRetry = () => resolve();
        }),
    );
    const client = new AgentSessionChatClient(protocol);
    const unsubscribe = client.subscribe('session-1', () => undefined);
    const retry = client.retryMessage({ sessionId: 'session-1', messageId: 'assistant-1' });

    expect(client.getState('session-1').isSubmitting).toBe(true);
    await client.refresh('session-1');
    expect(client.getState('session-1').isSubmitting).toBe(true);

    admitRetry();
    await retry;
    expect(client.getState('session-1').isSubmitting).toBe(false);
    unsubscribe();
  });

  test('admits an edit while the original exchange stays visible', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    const changed: string[] = [];
    let admitEdit!: () => void;
    protocol.editUserMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          admitEdit = () => resolve();
        }),
    );
    const client = new AgentSessionChatClient(protocol, {
      onTranscriptChanged: (sessionId) => changed.push(sessionId),
    });
    const unsubscribe = client.subscribe('session-1', () => undefined);
    const edit = client.editUserMessage({
      sessionId: 'session-1',
      messageId: 'user-1',
      text: 'Edited question',
    });

    expect(client.getState('session-1').isSubmitting).toBe(true);
    await client.refresh('session-1');
    expect(client.getState('session-1').isSubmitting).toBe(true);

    changed.length = 0;
    admitEdit();
    await edit;
    expect(protocol.editUserMessage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      messageId: 'user-1',
      text: 'Edited question',
    });
    expect(changed).toEqual(['session-1']);
    expect(client.getState('session-1').isSubmitting).toBe(false);
    unsubscribe();
  });

  test('starts a durable Session without leaving an ownerless observation before navigation', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    protocol.startSession.mockResolvedValue(snapshot().session);
    const client = new AgentSessionChatClient(protocol);

    await client.startSession({
      agentId: 'agent-1',
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ text: 'Hello', type: 'text' }],
    });

    expect(protocol.startSession).toHaveBeenCalledWith({
      agentId: 'agent-1',
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ text: 'Hello', type: 'text' }],
    });
    expect(protocol.observeSession).not.toHaveBeenCalled();
  });

  test('keeps first-message admission busy and cancellable without observing an uncreated session', async () => {
    const admission = deferred<AgentSessionSnapshot['session']>();
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    protocol.startSession.mockImplementation(() => admission.promise);
    const client = new AgentSessionChatClient(protocol);
    const input = {
      agentId: 'agent-1',
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ text: 'Hello', type: 'text' as const }],
    };
    const starting = client.startSession(input);
    try {
      expect(isAgentSessionBusy(client.getState(input.sessionId))).toBe(true);
      await expect(client.startSession(input)).rejects.toMatchObject({
        view: { code: 'SESSION_BUSY' },
      });
      await client.cancelTurn(input.sessionId);
      await client.cancelTurn(input.sessionId);
      expect(protocol.cancelSubmission).toHaveBeenCalledTimes(1);
      expect(protocol.cancelSubmission).toHaveBeenCalledWith({ sessionId: input.sessionId });
      expect(protocol.cancelTurn).not.toHaveBeenCalled();
      expect(protocol.observeSession).not.toHaveBeenCalled();
    } finally {
      // Reservation can already have committed when Stop arrives. A successful
      // admission stays navigable so its cancelled durable turn is not orphaned.
      admission.resolve(snapshot().session);
      await starting;
      expect(isAgentSessionBusy(client.getState(input.sessionId))).toBe(false);
      client.dispose();
    }
  });

  test('keeps an admitted Draft submission independent from destination observation', async () => {
    const protocol = protocolWithObservation(async () => {
      throw new Error('observation unavailable');
    });
    protocol.startSession.mockResolvedValue(snapshot().session);
    const client = new AgentSessionChatClient(protocol);

    await expect(
      client.startSession({
        agentId: 'agent-1',
        sessionId: 'session-1',
        userMessageId: 'user-1',
        assistantMessageId: 'assistant-1',
        parts: [{ text: 'Hello', type: 'text' }],
      }),
    ).resolves.toEqual(snapshot().session);
    expect(protocol.observeSession).not.toHaveBeenCalled();
  });

  test('forwards composer turn overrides with the submitted message', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    const client = new AgentSessionChatClient(protocol);

    await client.submitMessage({
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ text: 'Hello', type: 'text' }],
      modelId: 'provider::model-b',
      reasoningEffort: 'high',
    });

    expect(protocol.submitMessage).toHaveBeenCalledWith({
      modelId: 'provider::model-b',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
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

  test('refreshes the durable transcript when a message settles, not when it is created', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const onTranscriptChanged = jest.fn();
    const client = new AgentSessionChatClient(protocol, { onTranscriptChanged });
    await client.observe('session-1');
    onTranscriptChanged.mockClear();

    listener?.({ type: 'message.created', message: userMessage() });
    listener?.({ type: 'message.created', message: assistantMessage() });
    expect(client.getState('session-1').liveMessages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
    expect(onTranscriptChanged).not.toHaveBeenCalled();

    listener?.({
      type: 'message.finalized',
      message: { ...assistantMessage(), status: 'success' },
    });
    expect(onTranscriptChanged).toHaveBeenCalledTimes(1);
    expect(onTranscriptChanged).toHaveBeenCalledWith('session-1');
  });

  test('refreshes the transcript once the last parallel answer settles', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const onTranscriptChanged = jest.fn();
    const client = new AgentSessionChatClient(protocol, { onTranscriptChanged });
    await client.observe('session-1');
    onTranscriptChanged.mockClear();
    const second = { ...assistantMessage(), id: 'assistant-2' };
    listener?.({ type: 'message.created', message: userMessage() });
    listener?.({ type: 'message.created', message: assistantMessage() });
    listener?.({ type: 'message.created', message: second });

    // Settled history omits the turn until every answer settles, so reading it now shows nothing.
    listener?.({
      type: 'message.finalized',
      message: { ...assistantMessage(), status: 'success' },
    });
    expect(onTranscriptChanged).not.toHaveBeenCalled();
    listener?.({ type: 'message.finalized', message: { ...second, status: 'success' } });
    expect(onTranscriptChanged).toHaveBeenCalledTimes(1);
  });

  test('drops a deleted turn from live state and refreshes the durable transcript', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const onSessionChanged = jest.fn();
    const onTranscriptChanged = jest.fn();
    const client = new AgentSessionChatClient(protocol, { onSessionChanged, onTranscriptChanged });
    await client.observe('session-1');
    listener?.({ type: 'message.created', message: userMessage() });
    listener?.({ type: 'message.finalized', message: assistantMessage() });
    expect(client.getState('session-1').liveMessages).toHaveLength(2);

    await client.deleteTurn('session-1', 'turn-1');
    expect(protocol.deleteTurn).toHaveBeenCalledWith({
      sessionId: 'session-1',
      turnId: 'turn-1',
    });

    onTranscriptChanged.mockClear();
    onSessionChanged.mockClear();
    listener?.({ type: 'turn.deleted', turnId: 'turn-1', messageIds: ['user-1', 'assistant-1'] });

    // The rows are gone from the live overlay, so the refetched window is the
    // only thing left describing the transcript.
    expect(client.getState('session-1').liveMessages).toEqual([]);
    expect(onTranscriptChanged).toHaveBeenCalledWith('session-1');
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

  test.each(['streaming', 'success'] as const)(
    'cancels a selected %s answer by its own turn without stopping another active turn',
    async (status) => {
      const selected = { ...assistantMessage(), status };
      const activeTurn: AgentTurnView = {
        id: 'background-turn',
        sessionId: 'session-1',
        assistantMessageId: 'background-answer',
        status: 'running',
        startedAt: selected.createdAt,
        endedAt: null,
        error: null,
      };
      const protocol = protocolWithObservation(async () => ({
        snapshot: { ...snapshot(), activeTurn, streamingMessage: selected },
        unsubscribe: jest.fn(),
      }));
      const client = new AgentSessionChatClient(protocol);
      try {
        await client.observe('session-1');
        await client.cancelTurn('session-1', selected.id);
        if (status === 'streaming')
          expect(protocol.cancelTurn).toHaveBeenCalledWith({
            sessionId: 'session-1',
            turnId: selected.turnId,
            messageId: selected.id,
          });
        else expect(protocol.cancelTurn).not.toHaveBeenCalled();
      } finally {
        client.dispose();
      }
    },
  );

  test('stops a submission the Host is still admitting and releases the composer', async () => {
    const protocol = protocolWithObservation(async () => ({
      snapshot: snapshot(),
      unsubscribe: jest.fn(),
    }));
    let rejectSubmission!: (error: Error) => void;
    protocol.submitMessage.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );
    protocol.cancelSubmission.mockImplementation(async () => {
      rejectSubmission(
        new AgentProtocolError({ code: 'CANCELLED', message: 'cancelled', retryable: false }),
      );
    });
    const client = new AgentSessionChatClient(protocol);
    const unsubscribe = client.subscribe('session-1', () => undefined);
    const submission = client.submitMessage({
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ type: 'text', text: 'Hello' }],
    });
    const rejected = expect(submission).rejects.toMatchObject({ view: { code: 'CANCELLED' } });
    await waitForCall(protocol.submitMessage);

    await client.cancelTurn('session-1');
    await client.cancelTurn('session-1');

    await rejected;
    expect(protocol.cancelSubmission).toHaveBeenCalledTimes(1);
    expect(protocol.cancelSubmission).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(protocol.cancelTurn).not.toHaveBeenCalled();
    expect(client.getState('session-1').isSubmitting).toBe(false);
    await client.cancelTurn('session-1');
    expect(protocol.cancelSubmission).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('never submits when stopped before the Host receives the submission', async () => {
    const observation = deferred<AgentSessionObservation>();
    const protocol = protocolWithObservation(() => observation.promise);
    const client = new AgentSessionChatClient(protocol);
    const submission = client.submitMessage({
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ type: 'text', text: 'Hello' }],
    });

    await client.cancelTurn('session-1');
    observation.resolve({ snapshot: snapshot(), unsubscribe: jest.fn() });

    await expect(submission).rejects.toMatchObject({ view: { code: 'CANCELLED' } });
    expect(protocol.submitMessage).not.toHaveBeenCalled();
    expect(client.getState('session-1').isSubmitting).toBeFalsy();
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

  test('coalesces text deltas without duplicate turn updates notifying session subscribers', async () => {
    jest.useFakeTimers();
    let release = () => {};
    try {
      let listener: ((event: AgentEvent) => void) | undefined;
      const activeTurn: AgentTurnView = {
        id: 'turn-1',
        sessionId: 'session-1',
        status: 'running',
        assistantMessageId: 'assistant-1',
        startedAt: '2026-08-25T00:00:00.000Z',
        endedAt: null,
        error: null,
      };
      const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
        listener = nextListener;
        return { snapshot: { ...snapshot(), activeTurn }, unsubscribe: jest.fn() };
      });
      const client = new AgentSessionChatClient(protocol);
      await client.observe('session-1');
      const onChange = jest.fn();
      release = client.subscribe('session-1', onChange);
      listener?.({ type: 'message.created', message: assistantMessage() });
      onChange.mockClear();
      const before = client.getState('session-1');

      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: { op: 'text.append', partId: 'text-1', text: 'Hello' },
      });
      listener?.({ type: 'turn.updated', turn: { ...activeTurn } });
      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: { op: 'text.append', partId: 'text-1', text: ' world' },
      });

      listener?.({ type: 'turn.updated', turn: { ...activeTurn } });
      expect(client.getState('session-1')).toBe(before);
      expect(onChange).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(client.getState('session-1').liveMessages[0]?.parts).toEqual([
        { id: 'text-1', state: 'streaming', text: 'Hello world', type: 'text' },
      ]);
    } finally {
      release();
      jest.useRealTimers();
    }
  });

  test.each<Partial<AgentTurnView>>([
    { id: 'turn-2' },
    { sessionId: 'session-2' },
    { assistantMessageId: 'assistant-2' },
    { startedAt: '2026-08-25T00:01:00.000Z' },
    { endedAt: '2026-08-25T00:02:00.000Z' },
    { error: { code: 'EXECUTION_FAILED', message: 'Failed', retryable: true } },
    { status: 'awaiting-approval' },
    { status: 'awaiting-input' },
    { status: 'cancelling' },
    { status: 'completed' },
    { status: 'cancelled' },
    { status: 'interrupted' },
    { status: 'failed' },
  ])('immediately publishes a changed turn field: %j', async (patch) => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const activeTurn: AgentTurnView = {
      id: 'turn-1',
      sessionId: 'session-1',
      status: 'running',
      assistantMessageId: 'assistant-1',
      startedAt: '2026-08-25T00:00:00.000Z',
      endedAt: null,
      error: null,
    };
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: { ...snapshot(), activeTurn }, unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const onChange = jest.fn();
    const release = client.subscribe('session-1', onChange);
    const turn = { ...activeTurn, ...patch };
    listener?.({ type: 'turn.updated', turn });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(client.getState('session-1').activeTurn).toEqual(turn);
    release();
    client.dispose();
  });

  test.each([
    [400_000, 200],
    [8_000_000, 3000],
  ])(
    'spaces out %i characters without postponing an existing %i ms deadline',
    async (length, interval) => {
      jest.useFakeTimers();
      let release = () => {};
      try {
        let listener: ((event: AgentEvent) => void) | undefined;
        const text = 'a'.repeat(length);
        const message: AgentMessageView = {
          ...assistantMessage(),
          parts: [{ id: 'reasoning-1', state: 'streaming', text, type: 'reasoning' }],
        };
        const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
          listener = nextListener;
          return { snapshot: { ...snapshot(), streamingMessage: message }, unsubscribe: jest.fn() };
        });
        const client = new AgentSessionChatClient(protocol);
        await client.observe('session-1');
        const onChange = jest.fn();
        release = client.subscribe('session-1', onChange);
        const append = (value: string) =>
          listener?.({
            type: 'message.delta',
            messageId: 'assistant-1',
            delta: { op: 'text.append', partId: 'reasoning-1', text: value },
          });
        onChange.mockClear();
        append('b');
        jest.advanceTimersByTime(interval - 1);
        expect(onChange).not.toHaveBeenCalled();
        append('c');
        jest.advanceTimersByTime(2);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(client.getState('session-1').liveMessages[0]?.parts[0]).toMatchObject({
          text: `${text}bc`,
        });

        append('d');
        listener?.({
          type: 'message.finalized',
          message: {
            ...message,
            status: 'cancelled',
            parts: [{ id: 'reasoning-1', type: 'reasoning', state: 'done', text: `${text}bcd` }],
          },
        });
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(client.getState('session-1').liveMessages[0]?.parts[0]).toMatchObject({
          text: `${text}bcd`,
        });
        jest.advanceTimersByTime(3000);
        expect(onChange).toHaveBeenCalledTimes(2);
      } finally {
        release();
        jest.useRealTimers();
      }
    },
  );

  test('publishes tool previews only to the matching content subscriber and preserves list identity', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const message = {
      ...assistantMessage(),
      parts: [
        {
          id: 'tool-1',
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolRef: { source: 'builtin', capabilityId: 'write_file' },
          toolName: 'write_file',
          title: 'Write file',
          state: 'input-streaming',
        },
      ],
    } as AgentMessageView;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: { ...snapshot(), streamingMessage: message }, unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const onListChange = jest.fn();
    const onPreviewChange = jest.fn();
    const onOtherPreviewChange = jest.fn();
    const release = client.subscribe('session-1', onListChange);
    const releasePreview = client.toolInputPreviews.subscribe(
      'assistant-1',
      'call-1',
      onPreviewChange,
    );
    const releaseOther = client.toolInputPreviews.subscribe(
      'assistant-1',
      'call-2',
      onOtherPreviewChange,
    );
    const stateBefore = client.getState('session-1');
    try {
      for (const text of ['first', 'newest']) {
        listener?.({
          type: 'message.delta',
          messageId: 'assistant-1',
          delta: {
            op: 'tool.input.preview',
            partId: 'tool-1',
            preview: { text, truncated: false },
          },
        });
      }
      expect(client.toolInputPreviews.getSnapshot('assistant-1', 'call-1')).toEqual({
        text: 'newest',
        truncated: false,
      });
      expect(onPreviewChange).toHaveBeenCalledTimes(2);
      expect(onOtherPreviewChange).not.toHaveBeenCalled();
      expect(onListChange).not.toHaveBeenCalled();
      expect(client.getState('session-1')).toBe(stateBefore);

      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: {
          op: 'part.replace',
          part: {
            ...message.parts[0],
            state: 'input-available',
            input: { content: 'complete' },
          } as AgentMessageView['parts'][number],
        },
      });
      listener?.({
        type: 'message.delta',
        messageId: 'assistant-1',
        delta: {
          op: 'tool.input.preview',
          partId: 'tool-1',
          preview: { text: 'late stale content', truncated: false },
        },
      });
      expect(client.toolInputPreviews.getSnapshot('assistant-1', 'call-1')).toBeUndefined();
      expect(client.getState('session-1').liveMessages[0]?.parts[0]).toMatchObject({
        input: { content: 'complete' },
      });
    } finally {
      releasePreview();
      releaseOther();
      release();
      client.dispose();
    }
  });

  test('restores a preview from an observation snapshot and releases it with the session', async () => {
    const preview = { text: 'already generated', name: 'page.html', truncated: false };
    const protocol = protocolWithObservation(async () => ({
      snapshot: {
        ...snapshot(),
        streamingMessage: {
          ...assistantMessage(),
          parts: [
            {
              id: 'tool-1',
              type: 'dynamic-tool',
              toolCallId: 'call-1',
              toolRef: { source: 'builtin', capabilityId: 'write_file' },
              toolName: 'write_file',
              title: 'Write file',
              state: 'input-streaming',
              inputPreview: preview,
            },
          ],
        },
      },
      unsubscribe: jest.fn(),
    }));
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const release = client.subscribe('session-1', () => {});
    expect(client.toolInputPreviews.getSnapshot('assistant-1', 'call-1')).toEqual(preview);
    release();
    expect(client.toolInputPreviews.getSnapshot('assistant-1', 'call-1')).toBeUndefined();
    client.dispose();
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
      jest.advanceTimersByTime(100);
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

    client.reconcilePersistedMessages('session-1', [
      { ...finalizedAssistant, turnId: 'previous-attempt' },
    ]);
    expect(client.getState('session-1').liveMessages).toContain(finalizedAssistant);

    client.reconcilePersistedMessages('session-1', [userMessage(), finalizedAssistant]);

    expect(client.getState('session-1').liveMessages).toEqual([]);
  });

  test('releases a terminal live copy when late usage advances the durable message', async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
      listener = nextListener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const finalized: AgentMessageView = {
      ...assistantMessage(),
      status: 'cancelled',
      stats: { requestCount: 1 },
      updatedAt: '2026-08-25T00:00:01.000Z',
    };
    const persisted: AgentMessageView = {
      ...finalized,
      stats: { requestCount: 2, unpricedRequestCount: 1 },
      updatedAt: '2026-08-25T00:00:02.000Z',
    };
    listener?.({ type: 'message.finalized', message: finalized });

    client.reconcilePersistedMessages('session-1', [persisted]);

    expect(client.getState('session-1').liveMessages).toEqual([]);
  });

  test('releases admitted user input even when its live timestamp follows the stored row', async () => {
    let publish!: (event: AgentEvent) => void;
    const protocol = protocolWithObservation(async (_sessionId, listener) => {
      publish = listener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const persisted = userMessage();
    const live = { ...persisted, updatedAt: '2026-08-25T00:00:01.000Z' };
    publish({ type: 'message.created', message: live });

    client.reconcilePersistedMessages('session-1', [{ ...persisted, turnId: 'previous-attempt' }]);
    expect(client.getState('session-1').liveMessages).toEqual([live]);

    client.reconcilePersistedMessages('session-1', [persisted]);
    expect(client.getState('session-1').liveMessages).toEqual([]);
    client.dispose();
  });

  test('keeps a regenerated question live while its new answer runs', async () => {
    let publish!: (event: AgentEvent) => void;
    const protocol = protocolWithObservation(async (_sessionId, listener) => {
      publish = listener;
      return { snapshot: snapshot(), unsubscribe: jest.fn() };
    });
    const client = new AgentSessionChatClient(protocol);
    await client.observe('session-1');
    const question = userMessage();
    const answer = { ...assistantMessage(), id: 'assistant-2', parentId: question.id };
    publish({ type: 'message.created', message: question });
    publish({ type: 'message.created', message: answer });

    // A page read before the regeneration still holds the question with its earlier answer.
    client.reconcilePersistedMessages('session-1', [question]);
    expect(client.getState('session-1').liveMessages.map(({ id }) => id)).toEqual([
      question.id,
      answer.id,
    ]);

    const settled = { ...answer, status: 'success' as const };
    publish({ type: 'message.finalized', message: settled });
    client.reconcilePersistedMessages('session-1', [question, settled]);
    expect(client.getState('session-1').liveMessages).toEqual([]);
    client.dispose();
  });

  test.each([
    {
      liveStatus: 'cancelled',
      persistedStatus: 'cancelled',
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
    {
      liveStatus: 'cancelled',
      persistedStatus: 'streaming',
      updatedAt: '2026-08-25T00:00:02.000Z',
    },
    { liveStatus: 'cancelled', persistedStatus: 'error', updatedAt: '2026-08-25T00:00:02.000Z' },
    { liveStatus: 'streaming', persistedStatus: 'success', updatedAt: '2026-08-25T00:00:02.000Z' },
  ] satisfies {
    liveStatus: AgentMessageView['status'];
    persistedStatus: AgentMessageView['status'];
    updatedAt: string;
  }[])(
    'keeps a $liveStatus live copy for incompatible durable state $persistedStatus at $updatedAt',
    async ({ liveStatus, persistedStatus, updatedAt }) => {
      let listener: ((event: AgentEvent) => void) | undefined;
      const protocol = protocolWithObservation(async (_sessionId, nextListener) => {
        listener = nextListener;
        return { snapshot: snapshot(), unsubscribe: jest.fn() };
      });
      const client = new AgentSessionChatClient(protocol);
      await client.observe('session-1');
      const live: AgentMessageView = {
        ...assistantMessage(),
        status: liveStatus,
        updatedAt: '2026-08-25T00:00:01.000Z',
      };
      listener?.({ type: 'message.created', message: live });
      const state = client.getState('session-1');

      client.reconcilePersistedMessages('session-1', [
        { ...live, status: persistedStatus, updatedAt },
      ]);

      expect(client.getState('session-1')).toBe(state);
      expect(state.liveMessages).toEqual([live]);
    },
  );

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
      session: { ...snapshot().session, name: 'Lunar eclipses' },
    });

    expect(client.getState('session-1').snapshot?.session.name).toBe('Lunar eclipses');
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
