import type {
  AgentApprovalView,
  AgentEvent,
  AgentMessageView,
  AgentProtocol,
  AgentSessionSnapshot,
  AgentTurnView,
} from '@/shared/contracts/agent';

import { AgentSessionChatClient, isAgentSessionBusy } from '../AgentSessionChatClient';

/** Deterministic Mulberry32 PRNG so failures reproduce with the exact seed in CI. */
function createPrng(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

function createEmptySnapshot(sessionId = 'session-1'): AgentSessionSnapshot {
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
      id: sessionId,
      name: '',
      isNameManuallyEdited: false,
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
    streamingMessage: null,
  };
}

function createAssistantMessage(
  id: string,
  turnId: string,
  status: AgentMessageView['status'],
  text: string,
): AgentMessageView {
  return {
    id,
    sessionId: 'session-1',
    turnId,
    role: 'assistant',
    status,
    parts: [
      {
        id: `${id}-text`,
        type: 'text',
        text,
        state: status === 'streaming' ? 'streaming' : 'done',
      },
    ],
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
  };
}

function createTurn(
  id: string,
  assistantMessageId: string,
  status: AgentTurnView['status'],
): AgentTurnView {
  return {
    id,
    sessionId: 'session-1',
    assistantMessageId,
    status,
    startedAt: '2026-10-16T00:00:00.000Z',
    endedAt: status === 'running' ? null : '2026-10-16T00:00:05.000Z',
    error: null,
  };
}

function createApproval(id: string, turnId: string): AgentApprovalView {
  return {
    id,
    sessionId: 'session-1',
    turnId,
    toolCallId: `call-${id}`,
    toolRef: { source: 'builtin', capabilityId: 'web_search' },
    displayName: 'Web Search',
    input: { query: 'test' },
    status: 'pending',
  };
}

function createMockProtocol(
  onObserve: (sessionId: string, listener: (event: AgentEvent) => void) => void,
): AgentProtocol {
  return {
    observeSession: jest.fn(async (sessionId, listener) => {
      onObserve(sessionId, listener);
      return {
        snapshot: createEmptySnapshot(sessionId),
        unsubscribe: jest.fn(),
      };
    }),
  } as unknown as AgentProtocol;
}

const TERMINAL_TURN_STATUSES: readonly AgentTurnView['status'][] = [
  'completed',
  'failed',
  'cancelled',
  'interrupted',
];

describe('AgentSessionChatClient state-machine invariants', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('preserves invariants I1-I5 across 60 seeded randomized event sequences', async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = createPrng(seed * 9973);
      let listener!: (event: AgentEvent) => void;
      const protocol = createMockProtocol((_sessionId, nextListener) => {
        listener = nextListener;
      });
      const client = new AgentSessionChatClient(protocol);
      client.subscribe('session-1', () => {});

      await client.observe('session-1');

      const turnId = `turn-${seed}`;
      const messageId = `assistant-${seed}`;
      const partId = `${messageId}-text`;

      // Reference model for lossless text tracking and approval uniqueness.
      let expectedText = '';
      let isCreated = false;
      let isFinalized = false;
      let isDeleted = false;
      let isRuntimeFailed = false;
      const expectedApprovals = new Set<string>();

      const steps = 35;
      for (let step = 0; step < steps; step += 1) {
        if (isRuntimeFailed) break;
        const action = rng.int(10);

        if (!isCreated && action < 4) {
          isCreated = true;
          listener({ type: 'turn.updated', turn: createTurn(turnId, messageId, 'running') });
          listener({
            type: 'message.created',
            message: createAssistantMessage(messageId, turnId, 'streaming', ''),
          });
        } else if (isCreated && !isFinalized && !isDeleted && action < 4) {
          const chunk = `c${step}_`;
          expectedText += chunk;
          listener({
            type: 'message.delta',
            messageId,
            delta: { op: 'text.append', partId, text: chunk },
          });
        } else if (action === 4) {
          jest.advanceTimersByTime(rng.int(400) + 50);
        } else if (isCreated && !isDeleted && action === 5) {
          const approvalId = `approval-${rng.int(3)}`;
          // Still emit late approval.requested after finalization to verify I2 rejects zombie gates.
          if (!isFinalized) {
            expectedApprovals.add(approvalId);
          }
          listener({
            type: 'approval.requested',
            approval: createApproval(approvalId, turnId),
          });
        } else if (expectedApprovals.size > 0 && action === 6) {
          const approvalId = [...expectedApprovals][rng.int(expectedApprovals.size)];
          expectedApprovals.delete(approvalId);
          listener({
            type: 'approval.resolved',
            approval: { ...createApproval(approvalId, turnId), status: 'approved' },
          });
        } else if (isCreated && !isFinalized && !isDeleted && action === 7) {
          isFinalized = true;
          const terminalStatus = TERMINAL_TURN_STATUSES[rng.int(TERMINAL_TURN_STATUSES.length)];
          listener({
            type: 'message.finalized',
            message: createAssistantMessage(messageId, turnId, 'success', expectedText),
          });
          listener({
            type: 'turn.updated',
            turn: createTurn(turnId, messageId, terminalStatus),
          });
          expectedApprovals.clear();
        } else if (isCreated && isFinalized && !isDeleted && action === 8) {
          isDeleted = true;
          listener({
            type: 'turn.deleted',
            turnId,
            messageIds: [messageId],
          });
          expectedApprovals.clear();
        } else if (action === 9 && step > 25) {
          isRuntimeFailed = true;
          listener({ type: 'runtime.failed' });
          expectedApprovals.clear();
        }

        const state = client.getState('session-1');

        // I3: pendingApprovals never has duplicate IDs and matches the reference set.
        const approvalIds = state.pendingApprovals.map((a) => a.id);
        expect(new Set(approvalIds).size).toBe(approvalIds.length);
        if (!isRuntimeFailed && !isDeleted) {
          expect(new Set(approvalIds)).toEqual(expectedApprovals);
        }

        // I2: terminal turns always clear pending approvals and pending questions.
        if (state.activeTurn && TERMINAL_TURN_STATUSES.includes(state.activeTurn.status)) {
          expect(state.pendingApprovals).toEqual([]);
          expect(state.pendingQuestion).toBeNull();
          expect(isAgentSessionBusy(state)).toBe(false);
        }

        // I4: deleted turns remove their messages and clear activeTurn.
        if (isDeleted) {
          expect(state.liveMessages.some((m) => m.id === messageId)).toBe(false);
          expect(state.activeTurn).toBeNull();
          expect(state.pendingApprovals).toEqual([]);
          expect(state.pendingQuestion).toBeNull();
        }

        // I5: runtime.failed moves status to error and clears contextUsages.
        if (isRuntimeFailed) {
          expect(state.status).toBe('error');
          expect(state.contextUsages).toEqual([]);
        }
      }

      // Flush all pending timers and verify I1 (lossless text) for non-deleted messages.
      jest.runAllTimers();
      const settledState = client.getState('session-1');
      if (isCreated && !isDeleted && !isRuntimeFailed) {
        const msg = settledState.liveMessages.find((m) => m.id === messageId);
        expect(msg).toBeDefined();
        const textPart = msg?.parts.find((p) => p.type === 'text');
        expect(textPart && textPart.type === 'text' ? textPart.text : undefined).toBe(expectedText);
      }

      client.dispose();
    }
  });

  it('cancels a pending message flush when disposing an observed session (I6)', async () => {
    let listener!: (event: AgentEvent) => void;
    const client = new AgentSessionChatClient(
      createMockProtocol((_sessionId, nextListener) => {
        listener = nextListener;
      }),
    );
    const onChange = jest.fn();
    client.subscribe('session-1', onChange);
    await client.observe('session-1');
    const message = createAssistantMessage('assistant', 'turn', 'streaming', '');
    listener({ type: 'message.created', message });
    const timersBeforeDelta = jest.getTimerCount();
    listener({
      type: 'message.delta',
      messageId: message.id,
      delta: { op: 'text.append', partId: 'assistant-text', text: 'pending' },
    });
    expect(jest.getTimerCount()).toBe(timersBeforeDelta + 1);
    onChange.mockClear();

    client.dispose();

    expect(jest.getTimerCount()).toBe(timersBeforeDelta);
    jest.advanceTimersByTime(10_000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
