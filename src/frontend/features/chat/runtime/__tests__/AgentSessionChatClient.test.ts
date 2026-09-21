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
    usage: null,
    stats: null,
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
    deleteTurn: jest.fn(),
    forkSession: jest.fn(),
    retryMessage: jest.fn(),
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
    startSession: jest.fn(),
    submitMessage: jest.fn(),
  };
}

describe('AgentSessionChatClient', () => {
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

  test('marks the answer as retrying from the press until admission settles, across a refresh', async () => {
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

    expect(client.getState('session-1').retryingMessageId).toBe('assistant-1');
    // A re-observation mid-admission must not drop the projection.
    await client.refresh('session-1');
    expect(client.getState('session-1').retryingMessageId).toBe('assistant-1');

    admitRetry();
    await retry;
    expect(client.getState('session-1').retryingMessageId).toBeUndefined();
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
      executionTarget: { kind: 'local' },
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      parts: [{ text: 'Hello', type: 'text' }],
    });

    expect(protocol.startSession).toHaveBeenCalledWith({
      agentId: 'agent-1',
      executionTarget: { kind: 'local' },
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
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
      client.startSession({
        agentId: 'agent-1',
        executionTarget: { kind: 'local' },
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
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: { source: 'builtin', capabilityId: 'write_file' },
          providerName: 'write_file',
          displayName: 'Write file',
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
              type: 'tool',
              toolCallId: 'call-1',
              toolRef: { source: 'builtin', capabilityId: 'write_file' },
              providerName: 'write_file',
              displayName: 'Write file',
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
