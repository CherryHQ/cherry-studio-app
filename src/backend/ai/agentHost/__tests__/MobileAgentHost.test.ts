/**
 * End-to-end behavior of the Mobile Agent Host against the process-local
 * reference store and the Runtime contract. Pi-native mapping has its own
 * conformance suite; durable-adapter behavior is outside this suite.
 */

import {
  FakeRuntime,
  type RuntimeExecutionRequest,
  type RuntimeUsageContext,
} from '@/backend/ai/agent';
import type { AiService } from '@/backend/ai/AiService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import {
  AgentEventSchema,
  AgentProtocolError,
  type AgentEvent,
  type AgentSessionView,
} from '@/shared/contracts/agent';

import type { AgentDefinitionSource } from '../agentDefinitions';
import type { AgentSessionNaming } from '../AgentSessionNaming';
import { MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES } from '../contextCheckpoints';
import { InMemoryAgentSessionStore } from '../InMemoryAgentSessionStore';
import type { ManagedFileResolver } from '../managedFileResolver';
import { MobileAgentHost } from '../MobileAgentHost';

const AGENT_ID = 'agent-under-test';
const FILE_ENTRY_ID = '00000000-0000-7000-8000-000000000001';
const TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'delete_file' } as const;
const TOOL_PROVIDER_NAME = 'mcp_server_1_delete_file_a1b2';
const TOOL_DISPLAY_NAME = 'Delete file';

const USAGE_CONTEXT: RuntimeUsageContext = {
  credentialReceipt: { attribution: 'unknown' },
  modelId: 'mock-model',
  modelName: 'Mock Model',
  pricingSnapshot: null,
  providerId: 'mock-provider',
  providerName: 'Mock Provider',
  reportedCostCurrency: null,
  trustProviderReportedCost: false,
};

const agents: AgentDefinitionSource = {
  async getAgent(agentId) {
    if (agentId !== AGENT_ID) {
      return null;
    }
    return {
      id: AGENT_ID,
      name: 'Test Agent',
      instructions: 'Be brief.',
      model: { providerId: 'mock-provider', modelId: 'mock-model' },
      options: { maxOutputTokens: 512, reasoningEffort: 'low', temperature: 0.2 },
    };
  },
};

const FAKE_DESCRIPTOR = {
  id: 'fake',
  name: 'Scripted Runtime',
  capabilities: { reasoning: true, tools: true, approvals: true, attachments: true },
} as const;

const unusedAiService = {} as AiService;
const unusedPreferenceService = {} as PreferenceService;
type NamingOverride = Pick<
  AgentSessionNaming,
  'drain' | 'maybeRenameFromConversationSummary' | 'maybeRenameFromFirstUserMessage'
>;

const noOpNaming: NamingOverride = {
  drain: async () => undefined,
  maybeRenameFromConversationSummary: async () => null,
  maybeRenameFromFirstUserMessage: async () => null,
};
const backgroundReplyTurn = {
  awaitApproval: jest.fn(),
  finish: jest.fn(),
  update: jest.fn(),
};
const backgroundReply = {
  clearSession: jest.fn(),
  startTurn: jest.fn(() => backgroundReplyTurn),
  updateSessionTitle: jest.fn(),
};
const usage = {
  drain: jest.fn(async () => undefined),
  record: jest.fn(),
};

const noFiles: ManagedFileResolver = {
  resolveAvailable: jest.fn(async () => new Map()),
  readAsDataUrl: jest.fn(async () => undefined),
};

function createHost(
  runtime: FakeRuntime,
  naming: NamingOverride = noOpNaming,
  files: ManagedFileResolver = noFiles,
): MobileAgentHost {
  return new MobileAgentHost(
    store,
    unusedAiService,
    unusedPreferenceService,
    backgroundReply,
    runtime,
    {
      agents,
      files,
      naming,
      usage,
    },
  );
}

function hostWithText(texts: string[], requests: RuntimeExecutionRequest[] = []): MobileAgentHost {
  const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR });
  for (const text of texts) {
    runtime.script((controller) => {
      requests.push(controller.request);
      controller.emit({
        type: 'part.add',
        index: 0,
        part: { id: 'text-1', type: 'text', text: '', state: 'streaming' },
      });
      for (const character of text) {
        controller.emit({ type: 'text.delta', partId: 'text-1', text: character });
      }
      controller.emit({
        type: 'part.replace',
        part: { id: 'text-1', type: 'text', text, state: 'done' },
      });
      controller.emit({
        type: 'usage',
        completedAt: 1_500,
        context: USAGE_CONTEXT,
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      });
      controller.emit({ type: 'completed' });
    });
  }
  return createHost(runtime);
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function terminalTurnEvent(
  events: AgentEvent[],
): Extract<AgentEvent, { type: 'turn.updated' }> | undefined {
  return events.find(
    (event): event is Extract<AgentEvent, { type: 'turn.updated' }> =>
      event.type === 'turn.updated' &&
      ['completed', 'failed', 'cancelled', 'interrupted'].includes(event.turn.status),
  );
}

/** Invariant 9: every protocol value survives a JSON round trip and re-validates. */
function assertJsonRoundTrip(events: AgentEvent[]): void {
  for (const event of events) {
    AgentEventSchema.parse(JSON.parse(JSON.stringify(event)));
  }
}

let store: InMemoryAgentSessionStore;

describe('MobileAgentHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store = new InMemoryAgentSessionStore();
  });

  test('runs basic chat end to end: create, observe, submit, stream, record', async () => {
    const requests: RuntimeExecutionRequest[] = [];
    const host = hostWithText(['Hi', 'Ok'], requests);

    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    expect(session.agentId).toBe(AGENT_ID);

    const events: AgentEvent[] = [];
    const observation = await host.observeSession(session.id, (event) => events.push(event));
    expect(observation.snapshot.agent).toEqual({ id: AGENT_ID, name: 'Test Agent' });
    expect(observation.snapshot.capabilities).toEqual({
      reasoning: true,
      tools: true,
      approvals: true,
      attachments: true,
    });
    expect(observation.snapshot.activeTurn).toBeNull();

    const submitted = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Hello.' }],
    });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the turn to settle');

    // Event stream shape.
    expect(events.map((event) => event.type)).toEqual([
      'message.created', // user
      'message.created', // assistant placeholder
      'turn.updated', // running
      'message.delta', // part.add
      'message.delta', // text.append H
      'message.delta', // text.append i
      'message.delta', // part.replace done
      'message.finalized',
      'turn.updated', // completed
    ]);
    assertJsonRoundTrip(events);

    const finalized = events.find((event) => event.type === 'message.finalized');
    if (finalized?.type !== 'message.finalized') throw new Error('missing finalized message');
    expect(finalized.message.id).toBe(submitted.assistantMessageId);
    expect(finalized.message.status).toBe('success');
    expect(finalized.message.parts).toEqual([
      { id: 'text-1', type: 'text', text: 'Hi', state: 'done' },
    ]);
    expect(finalized.message.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
    expect(backgroundReply.startTurn).toHaveBeenCalledWith({
      agentId: AGENT_ID,
      agentName: 'Test Agent',
      sessionId: session.id,
      sessionTitle: '',
    });
    expect(backgroundReplyTurn.update).toHaveBeenCalled();
    expect(backgroundReplyTurn.finish).toHaveBeenCalledWith('completed', {
      waitFor: expect.any(Promise),
    });
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({ id: AGENT_ID }),
        assistantMessageId: submitted.assistantMessageId,
        report: {
          completedAt: 1_500,
          context: USAGE_CONTEXT,
          usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        },
        turnId: submitted.turnId,
      }),
    );

    const terminal = terminalTurnEvent(events);
    expect(terminal?.turn.status).toBe('completed');
    expect(terminal?.turn.endedAt).not.toBeNull();
    expect(terminal?.turn.error).toBeNull();

    // The stored transcript is the source of truth for the next turn.
    const transcript = await store.listMessages(session.id);
    expect(transcript.map((message) => [message.role, message.status])).toEqual([
      ['user', 'success'],
      ['assistant', 'success'],
    ]);
    expect(transcript[1]?.parts).toEqual(finalized.message.parts);
    expect(transcript[1]?.usage).toEqual(finalized.message.usage);

    // The Runtime saw the current Agent definition and the turn input.
    expect(requests[0]).toMatchObject({
      instructions: 'Be brief.',
      history: [],
      contextCheckpoint: null,
      input: [{ type: 'text', text: 'Hello.' }],
      model: { providerId: 'mock-provider', modelId: 'mock-model' },
      options: { maxOutputTokens: 512, reasoningEffort: 'low', temperature: 0.2 },
    });

    // A second turn feeds the stored transcript back as history.
    const secondEvents: AgentEvent[] = [];
    const second = await host.observeSession(session.id, (event) => secondEvents.push(event));
    expect(second.snapshot.activeTurn).toBeNull();
    await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'More.' }] });
    await waitFor(() => terminalTurnEvent(secondEvents) !== undefined, 'the second turn');
    expect(
      requests[1]?.history.flatMap((turn) => turn.messages.map((message) => message.role)),
    ).toEqual(['user', 'assistant']);
  });

  test('persists a completed checkpoint and replays it after Host recreation', async () => {
    const checkpoint = {
      version: 1 as const,
      anchorTurnId: '',
      payload: { summary: 'First turn summary.' },
    };
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR })
      .scriptEvents([{ type: 'completed' }])
      .script((controller) => {
        const anchorTurnId = controller.request.history[0]?.turnId;
        if (!anchorTurnId) throw new Error('missing prior turn anchor');
        checkpoint.anchorTurnId = anchorTurnId;
        controller.emit({ type: 'context.checkpoint', checkpoint });
        controller.emit({ type: 'completed' });
      });
    const host = createHost(runtime);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));
    const completedCount = () =>
      events.filter((event) => event.type === 'turn.updated' && event.turn.status === 'completed')
        .length;

    const first = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'First.' }],
    });
    await waitFor(() => completedCount() === 1, 'the first checkpoint turn');
    const second = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Second.' }],
    });
    await waitFor(() => completedCount() === 2, 'the checkpoint-producing turn');
    expect(checkpoint.anchorTurnId).toBe(first.turnId);
    expect(await store.getLatestContextCheckpoint(session.id)).toEqual({
      assistantMessageId: second.assistantMessageId,
      checkpoint,
    });

    const replayed: RuntimeExecutionRequest[] = [];
    const restartedRuntime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).script(
      (controller) => {
        replayed.push(controller.request);
        controller.emit({ type: 'completed' });
      },
    );
    const restartedHost = createHost(restartedRuntime);
    const restartedEvents: AgentEvent[] = [];
    await restartedHost.observeSession(session.id, (event) => restartedEvents.push(event));
    await restartedHost.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Third.' }],
    });
    await waitFor(
      () => terminalTurnEvent(restartedEvents)?.turn.status === 'completed',
      'the replayed turn',
    );

    expect(replayed[0]?.contextCheckpoint).toEqual(checkpoint);
    expect(replayed[0]?.history.map((turn) => turn.turnId)).toEqual([second.turnId]);
  });

  test('does not persist checkpoints from failed or cancelled turns', async () => {
    let anchorTurnId = '';
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR })
      .script((controller) => {
        anchorTurnId = controller.turnId;
        controller.emit({ type: 'completed' });
      })
      .script((controller) => {
        controller.emit({
          type: 'context.checkpoint',
          checkpoint: { version: 1, anchorTurnId, payload: { unsafe: 'failed' } },
        });
        controller.emit({
          type: 'failed',
          error: { code: 'runtime_error', message: 'failed', retryable: false },
        });
      })
      .script((controller) => {
        controller.emit({
          type: 'context.checkpoint',
          checkpoint: { version: 1, anchorTurnId, payload: { unsafe: 'cancelled' } },
        });
        controller.emit({ type: 'cancelled' });
      });
    const host = createHost(runtime);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));
    const terminalCount = () =>
      events.filter(
        (event) =>
          event.type === 'turn.updated' &&
          ['completed', 'failed', 'cancelled'].includes(event.turn.status),
      ).length;

    for (const [index, text] of ['anchor', 'fail', 'cancel'].entries()) {
      await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text }] });
      await waitFor(() => terminalCount() === index + 1, `${text} turn`);
    }

    expect(await store.getLatestContextCheckpoint(session.id)).toBeNull();
  });

  test('rejects an oversized checkpoint without truncating or failing the turn', async () => {
    let anchorTurnId = '';
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR })
      .script((controller) => {
        anchorTurnId = controller.turnId;
        controller.emit({ type: 'completed' });
      })
      .script((controller) => {
        controller.emit({
          type: 'context.checkpoint',
          checkpoint: {
            version: 1,
            anchorTurnId,
            payload: 'x'.repeat(MAX_RUNTIME_CONTEXT_CHECKPOINT_BYTES),
          },
        });
        controller.emit({ type: 'completed' });
      });
    const host = createHost(runtime);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));
    const completedCount = () =>
      events.filter((event) => event.type === 'turn.updated' && event.turn.status === 'completed')
        .length;

    await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'one' }] });
    await waitFor(() => completedCount() === 1, 'the anchor turn');
    await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'two' }] });
    await waitFor(() => completedCount() === 2, 'the oversized checkpoint turn');

    expect(await store.getLatestContextCheckpoint(session.id)).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'turn.updated', turn: { status: 'completed' } });
  });

  test.each([
    ['corrupt', 'not-json'],
    ['unsupported version', { version: 2, anchorTurnId: 'turn-1', payload: {} }],
    ['missing anchor', { version: 1, anchorTurnId: 'missing', payload: {} }],
  ])('falls back to complete history for a %s persisted checkpoint', async (_name, checkpoint) => {
    const requests: RuntimeExecutionRequest[] = [];
    const host = hostWithText(['One', 'Two'], requests);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));
    const completedCount = () =>
      events.filter((event) => event.type === 'turn.updated' && event.turn.status === 'completed')
        .length;

    await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'First.' }] });
    await waitFor(() => completedCount() === 1, 'the first turn');
    jest.spyOn(store, 'getLatestContextCheckpoint').mockResolvedValueOnce({
      assistantMessageId: 'checkpoint-row',
      checkpoint,
    });
    await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'Second.' }] });
    await waitFor(() => completedCount() === 2, 'the fallback turn');

    expect(requests[1]?.contextCheckpoint).toBeNull();
    expect(requests[1]?.history).toHaveLength(1);
    expect(requests[1]?.history[0]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  test('applies composer model and reasoning snapshots to only the submitted turn', async () => {
    const requests: RuntimeExecutionRequest[] = [];
    const host = hostWithText(['One', 'Two', 'Three'], requests);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));
    const completedTurnCount = () =>
      events.filter((event) => event.type === 'turn.updated' && event.turn.status === 'completed')
        .length;

    await host.submitMessage({
      modelId: 'override-provider::override-model',
      parts: [{ type: 'text', text: 'Override both.' }],
      reasoningEffort: 'max',
      sessionId: session.id,
    });
    await waitFor(() => completedTurnCount() === 1, 'the override turn');
    expect(requests[0]).toMatchObject({
      model: { modelId: 'override-model', providerId: 'override-provider' },
      options: { maxOutputTokens: 512, reasoningEffort: 'max', temperature: 0.2 },
    });

    await host.submitMessage({
      parts: [{ type: 'text', text: 'Use the model default.' }],
      reasoningEffort: 'default',
      sessionId: session.id,
    });
    await waitFor(() => completedTurnCount() === 2, 'the default-effort turn');
    expect(requests[1]).toMatchObject({
      model: { modelId: 'mock-model', providerId: 'mock-provider' },
      options: { maxOutputTokens: 512, temperature: 0.2 },
    });
    expect(requests[1]?.options).not.toHaveProperty('reasoningEffort');

    await host.submitMessage({
      parts: [{ type: 'text', text: 'Use the Agent configuration again.' }],
      sessionId: session.id,
    });
    await waitFor(() => completedTurnCount() === 3, 'the inherited Agent turn');
    expect(requests[2]).toMatchObject({
      model: { modelId: 'mock-model', providerId: 'mock-provider' },
      options: { maxOutputTokens: 512, reasoningEffort: 'low', temperature: 0.2 },
    });
  });

  test('cancel settles the turn as cancelled and is idempotent', async () => {
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).script(async (controller) => {
      controller.emit({
        type: 'part.add',
        index: 0,
        part: { id: 'text-1', type: 'text', text: '', state: 'streaming' },
      });
      controller.emit({ type: 'text.delta', partId: 'text-1', text: 'Working' });
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const host = createHost(runtime);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));

    const submitted = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Hello.' }],
    });

    // A concurrent submit while the turn is active fails closed (invariant 1).
    await expect(
      host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'again' }] }),
    ).rejects.toMatchObject({ view: { code: 'SESSION_BUSY' } });

    await waitFor(
      () =>
        events.some((event) => event.type === 'message.delta' && event.delta.op === 'text.append'),
      'streaming to start',
    );
    await host.cancelTurn({ sessionId: session.id, turnId: submitted.turnId });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the turn to settle');

    const statuses = events
      .filter((event) => event.type === 'turn.updated')
      .map((event) => (event.type === 'turn.updated' ? event.turn.status : ''));
    expect(statuses).toEqual(['running', 'cancelling', 'cancelled']);
    assertJsonRoundTrip(events);

    const transcript = await store.listMessages(session.id);
    expect(transcript[1]?.status).toBe('cancelled');
    // Streaming parts settle as done in the stored transcript.
    expect(transcript[1]?.parts).toEqual([
      { id: 'text-1', type: 'text', text: 'Working', state: 'done' },
    ]);

    // Idempotent: cancelling a settled turn is a no-op, not an error.
    await expect(
      host.cancelTurn({ sessionId: session.id, turnId: submitted.turnId }),
    ).resolves.toBeUndefined();

    // The session is idle again.
    const observation = await host.observeSession(session.id, () => {});
    expect(observation.snapshot.activeTurn).toBeNull();
  });

  test('updates an active background reply when its Session is renamed', async () => {
    const started = createDeferred();
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).script(async (controller) => {
      started.resolve();
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const host = createHost(runtime);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const submitted = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Hello.' }],
    });
    await started.promise;

    await host.renameSession({ sessionId: session.id, title: 'Renamed Session' });

    expect(backgroundReply.updateSessionTitle).toHaveBeenCalledWith(session.id, 'Renamed Session');
    await host.cancelTurn({ sessionId: session.id, turnId: submitted.turnId });
  });

  test('applies summary naming after the turn leaves active Host state', async () => {
    let resolveSummary!: (session: AgentSessionView | null) => void;
    const summaryName = new Promise<AgentSessionView | null>((resolve) => {
      resolveSummary = resolve;
    });
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).scriptEvents([
      { type: 'completed' },
    ]);
    const host = createHost(runtime, {
      drain: async () => undefined,
      maybeRenameFromConversationSummary: () => summaryName,
      maybeRenameFromFirstUserMessage: async () => null,
    });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });

    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Hello.' }],
    });
    await waitFor(() => backgroundReplyTurn.finish.mock.calls.length > 0, 'the turn to finish');
    const renamed = await store.autoRenameSession(session.id, '', 'Summary title');
    resolveSummary(renamed);
    await waitFor(
      () => backgroundReply.updateSessionTitle.mock.calls.length > 0,
      'the background title to update',
    );

    expect(backgroundReply.updateSessionTitle).toHaveBeenCalledWith(session.id, 'Summary title');
  });

  test('applies a manual rename while terminal background content awaits naming', async () => {
    let resolveSummary!: (session: AgentSessionView | null) => void;
    const summaryName = new Promise<AgentSessionView | null>((resolve) => {
      resolveSummary = resolve;
    });
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).scriptEvents([
      { type: 'completed' },
    ]);
    const host = createHost(runtime, {
      drain: async () => undefined,
      maybeRenameFromConversationSummary: () => summaryName,
      maybeRenameFromFirstUserMessage: async () => null,
    });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });

    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Hello.' }],
    });
    await waitFor(() => backgroundReplyTurn.finish.mock.calls.length > 0, 'the turn to finish');

    await host.renameSession({ sessionId: session.id, title: 'Manual title' });

    expect(backgroundReply.updateSessionTitle).toHaveBeenCalledWith(session.id, 'Manual title');
    resolveSummary(null);
  });

  test('reconciliation marks preloaded unfinished messages interrupted', async () => {
    // Preload the reference adapter with the state a durable adapter would
    // restore after a process death.
    const session = await store.createSession({ agentId: AGENT_ID });
    const reserved = await store.reserveSubmission({
      sessionId: session.id,
      userParts: [{ id: 'input-0', type: 'text', text: 'Hello.', state: 'done' }],
    });
    expect(reserved.assistantMessage.turnId).toBe(reserved.turnId);
    expect(reserved.userMessage.turnId).toBe(reserved.turnId);

    const host = hostWithText(['unused']);
    const count = await host.reconcileInterruptedTurns();
    expect(count).toBe(1);

    const transcript = await store.listMessages(session.id);
    expect(transcript.map((message) => message.status)).toEqual(['success', 'interrupted']);

    // Reconciliation is idempotent and the session observes as idle.
    await expect(host.reconcileInterruptedTurns()).resolves.toBe(0);
    const observation = await host.observeSession(session.id, () => {});
    expect(observation.snapshot.activeTurn).toBeNull();
  });

  test('settles an active turn before deleting its Session rows', async () => {
    let executionStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      executionStarted = resolve;
    });
    const fake = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).script(async (controller) => {
      executionStarted?.();
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const host = createHost(fake);
    const finalize = jest.spyOn(store, 'finalizeAssistantMessage');
    const remove = jest.spyOn(store, 'deleteSession');
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Delete this Session.' }],
    });
    await started;
    await host.deleteSession({ sessionId: session.id });

    expect(finalize).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(finalize.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    await expect(store.getSession(session.id)).resolves.toBeNull();
  });

  test('waits for an admitted submission before deleting its Session rows', async () => {
    const admissionStarted = createDeferred();
    const releaseAdmission = createDeferred();
    const sequence: string[] = [];
    const fake = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).scriptEvents([
      { type: 'completed' },
    ]);
    const host = createHost(fake);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const getSession = store.getSession.bind(store);
    jest.spyOn(store, 'getSession').mockImplementationOnce(async (sessionId) => {
      const result = await getSession(sessionId);
      sequence.push('admission.started');
      admissionStarted.resolve();
      await releaseAdmission.promise;
      sequence.push('admission.resumed');
      return result;
    });
    const removeSession = store.deleteSession.bind(store);
    jest.spyOn(store, 'deleteSession').mockImplementation(async (sessionId) => {
      sequence.push('delete.rows');
      return removeSession(sessionId);
    });

    const submission = host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Admit before deleting.' }],
    });
    await admissionStarted.promise;
    const deletion = host.deleteSession({ sessionId: session.id });
    const deletedDuringAdmission = sequence.includes('delete.rows');

    releaseAdmission.resolve();
    const [submissionResult, deletionResult] = await Promise.allSettled([submission, deletion]);

    expect(deletedDuringAdmission).toBe(false);
    expect(sequence).toEqual(['admission.started', 'admission.resumed', 'delete.rows']);
    expect(submissionResult.status).toBe('fulfilled');
    expect(deletionResult.status).toBe('fulfilled');
  });

  test('rejects a new submission after an old turn drains while deletion is pending', async () => {
    const firstExecutionStarted = createDeferred();
    const deleteRowsStarted = createDeferred();
    const releaseDeleteRows = createDeferred();
    let executionCount = 0;
    const fake = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR })
      .script(async (controller) => {
        executionCount += 1;
        firstExecutionStarted.resolve();
        await new Promise<void>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      })
      .script((controller) => {
        executionCount += 1;
        controller.emit({ type: 'completed' });
      });
    const host = createHost(fake);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const removeSession = store.deleteSession.bind(store);
    jest.spyOn(store, 'deleteSession').mockImplementationOnce(async (sessionId) => {
      deleteRowsStarted.resolve();
      await releaseDeleteRows.promise;
      return removeSession(sessionId);
    });

    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Start the old turn.' }],
    });
    await firstExecutionStarted.promise;
    const deletion = host.deleteSession({ sessionId: session.id });
    await deleteRowsStarted.promise;

    const resubmission = await host
      .submitMessage({
        sessionId: session.id,
        parts: [{ type: 'text', text: 'Must not start during deletion.' }],
      })
      .then(
        () => ({ status: 'accepted' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    releaseDeleteRows.resolve();
    await deletion;

    expect(resubmission).toMatchObject({
      status: 'rejected',
      error: { view: { code: 'SESSION_BUSY' } },
    });
    expect(executionCount).toBe(1);
  });

  test('maps runtime approvals onto protocol approvals and correlates responses', async () => {
    const fake = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR });
    fake.script(async (controller) => {
      const approvalId = 'approval-1';
      controller.emit({
        type: 'part.add',
        index: 0,
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          providerName: TOOL_PROVIDER_NAME,
          displayName: TOOL_DISPLAY_NAME,
          state: 'awaiting-approval',
          input: { fileEntryId: 'file-1' },
          approvalId,
        },
      });
      controller.emit({
        type: 'approval.requested',
        approval: {
          id: approvalId,
          turnId: controller.turnId,
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          displayName: TOOL_DISPLAY_NAME,
          input: { fileEntryId: 'file-1' },
          status: 'pending',
        },
      });
      const decision = await controller.waitForApproval(approvalId);
      controller.emit({
        type: 'approval.resolved',
        approval: {
          id: approvalId,
          turnId: controller.turnId,
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          displayName: TOOL_DISPLAY_NAME,
          input: { fileEntryId: 'file-1' },
          status: decision === 'approve' ? 'approved' : 'denied',
        },
      });
      controller.emit({
        type: 'part.replace',
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          providerName: TOOL_PROVIDER_NAME,
          displayName: TOOL_DISPLAY_NAME,
          state: decision === 'approve' ? 'output-available' : 'denied',
          input: { fileEntryId: 'file-1' },
          output:
            decision === 'approve'
              ? { value: { deleted: true }, artifacts: [] }
              : {
                  value: { status: 'denied', reason: 'The user denied this tool call.' },
                  artifacts: [],
                },
        },
      });
      controller.emit({ type: 'completed' });
    });
    const host = createHost(fake);

    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));
    const submitted = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Delete it.' }],
    });

    await waitFor(
      () => events.some((event) => event.type === 'approval.requested'),
      'the approval request',
    );
    const requested = events.find((event) => event.type === 'approval.requested');
    if (requested?.type !== 'approval.requested') throw new Error('missing approval request');
    expect(requested.approval.sessionId).toBe(session.id);
    expect(requested.approval.turnId).toBe(submitted.turnId);

    // A snapshot taken now carries the live approval and turn state (invariant 8).
    const midStream = await host.observeSession(session.id, () => {});
    expect(midStream.snapshot.activeTurn?.status).toBe('awaiting-approval');
    expect(midStream.snapshot.pendingApprovals).toEqual([requested.approval]);

    // Wrong correlation fails closed (invariant 7).
    await expect(
      host.respondApproval({
        sessionId: session.id,
        turnId: submitted.turnId,
        approvalId: 'unknown-approval',
        decision: 'approve',
      }),
    ).rejects.toBeInstanceOf(AgentProtocolError);

    await host.respondApproval({
      sessionId: session.id,
      turnId: submitted.turnId,
      approvalId: requested.approval.id,
      decision: 'approve',
    });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the turn to settle');

    const statuses = events
      .filter((event) => event.type === 'turn.updated')
      .map((event) => (event.type === 'turn.updated' ? event.turn.status : ''));
    expect(statuses).toEqual(['running', 'awaiting-approval', 'running', 'completed']);
    expect(events.some((event) => event.type === 'approval.resolved')).toBe(true);
    assertJsonRoundTrip(events);

    const transcript = await store.listMessages(session.id);
    const toolPart = transcript[1]?.parts[0];
    expect(toolPart).toMatchObject({ type: 'tool', state: 'output-available' });
  });

  test('validates managed files before reservation and persists authoritative references', async () => {
    const requests: RuntimeExecutionRequest[] = [];
    const fake = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR })
      .script((controller) => {
        requests.push(controller.request);
        controller.emit({ type: 'completed' });
      })
      .script((controller) => {
        requests.push(controller.request);
        controller.emit({ type: 'completed' });
      });
    const imageFact = {
      fileEntryId: FILE_ENTRY_ID,
      mediaType: 'image/png',
      name: 'managed.png',
      size: 128,
    };
    const resolveAvailable = jest
      .fn<Promise<ReadonlyMap<string, typeof imageFact>>, [readonly string[]]>()
      .mockResolvedValueOnce(new Map([[FILE_ENTRY_ID, imageFact]]))
      .mockResolvedValueOnce(new Map());
    const readAsDataUrl = jest.fn(async () => 'data:image/png;base64,AAAA');
    const host = createHost(fake, noOpNaming, { readAsDataUrl, resolveAvailable });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));

    await host.submitMessage({
      sessionId: session.id,
      parts: [
        { type: 'text', text: 'Remember this image.' },
        { type: 'file', fileEntryId: FILE_ENTRY_ID, mediaType: 'image/png' },
      ],
    });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the attachment turn');

    expect(resolveAvailable).toHaveBeenNthCalledWith(1, [FILE_ENTRY_ID]);
    const transcript = await store.listMessages(session.id);
    expect(transcript[0]?.parts).toEqual([
      { id: 'input-0', type: 'text', text: 'Remember this image.', state: 'done' },
      {
        id: 'input-1',
        type: 'file',
        fileEntryId: FILE_ENTRY_ID,
        mediaType: 'image/png',
        name: 'managed.png',
        purpose: 'input-attachment',
      },
    ]);
    expect(requests[0]?.input).toEqual([
      { type: 'text', text: 'Remember this image.' },
      {
        type: 'file',
        mediaType: 'image/png',
        name: 'managed.png',
        uri: 'data:image/png;base64,AAAA',
      },
    ]);
    expect(JSON.stringify(transcript)).not.toContain('data:image');

    // A later missing blob does not invalidate the historical reference or
    // fail a text-only turn. Its content is omitted from Pi history.
    events.length = 0;
    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'Continue.' }],
    });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the follow-up turn');
    expect(resolveAvailable).toHaveBeenCalledTimes(2);
    expect(requests[1]?.history.flatMap((turn) => turn.messages)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parts: expect.arrayContaining([expect.objectContaining({ type: 'file' })]),
        }),
      ]),
    );
    expect((await store.listMessages(session.id))[0]?.parts[1]).toMatchObject({
      fileEntryId: FILE_ENTRY_ID,
      purpose: 'input-attachment',
    });
  });

  test('replays available managed images across turns for an image-capable model', async () => {
    const requests: RuntimeExecutionRequest[] = [];
    const fake = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR })
      .script((controller) => {
        requests.push(controller.request);
        controller.emit({ type: 'completed' });
      })
      .script((controller) => {
        requests.push(controller.request);
        controller.emit({ type: 'completed' });
      });
    const fact = {
      fileEntryId: FILE_ENTRY_ID,
      mediaType: 'image/png',
      name: 'managed.png',
      size: 128,
    };
    const files: ManagedFileResolver = {
      readAsDataUrl: async () => 'data:image/png;base64,AAAA',
      resolveAvailable: async () => new Map([[FILE_ENTRY_ID, fact]]),
    };
    const host = createHost(fake, noOpNaming, files);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));

    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'file', fileEntryId: FILE_ENTRY_ID, mediaType: 'image/png' }],
    });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the first image turn');
    events.length = 0;
    await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'text', text: 'What was in that image?' }],
    });
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the historical image turn');

    expect(requests[1]?.history).toEqual(
      expect.arrayContaining([
        {
          turnId: expect.any(String),
          messages: [
            {
              role: 'user',
              parts: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  name: 'managed.png',
                  uri: 'data:image/png;base64,AAAA',
                },
              ],
            },
          ],
        },
      ]),
    );
  });

  test('rejects unsupported models and endpoints before reserving image messages', async () => {
    const fact = {
      fileEntryId: FILE_ENTRY_ID,
      mediaType: 'image/png',
      name: 'managed.png',
      size: 128,
    };
    const textOnlyRuntime = new FakeRuntime({
      descriptor: FAKE_DESCRIPTOR,
      modelPreflight: {
        contextWindow: 128_000,
        inputModalities: ['text'],
        maxInputTokens: 120_000,
        maxOutputTokens: 8_000,
        supportsTools: true,
      },
    });
    const files: ManagedFileResolver = {
      readAsDataUrl: jest.fn(async () => 'data:image/png;base64,AAAA'),
      resolveAvailable: async () => new Map([[FILE_ENTRY_ID, fact]]),
    };
    const host = createHost(textOnlyRuntime, noOpNaming, files);
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });

    await expect(
      host.submitMessage({
        sessionId: session.id,
        parts: [{ type: 'file', fileEntryId: FILE_ENTRY_ID, mediaType: 'image/png' }],
      }),
    ).rejects.toMatchObject({ view: { code: 'CAPABILITY_UNSUPPORTED' } });
    expect(await store.listMessages(session.id)).toEqual([]);
    expect(files.readAsDataUrl).not.toHaveBeenCalled();

    const unsupportedEndpointRuntime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR });
    jest
      .spyOn(unsupportedEndpointRuntime, 'preflightModel')
      .mockRejectedValue(new Error('unsupported endpoint containing private configuration'));
    const endpointHost = createHost(unsupportedEndpointRuntime, noOpNaming, files);
    const endpointSession = await endpointHost.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    await expect(
      endpointHost.submitMessage({
        sessionId: endpointSession.id,
        parts: [{ type: 'file', fileEntryId: FILE_ENTRY_ID, mediaType: 'image/png' }],
      }),
    ).rejects.toMatchObject({
      message: 'The selected model or provider endpoint cannot execute this turn.',
      view: { code: 'CAPABILITY_UNSUPPORTED' },
    });
    expect(await store.listMessages(endpointSession.id)).toEqual([]);
  });

  test('aborts managed image reads and discards late data when the turn is cancelled', async () => {
    let readSignal: AbortSignal | undefined;
    let resolveRead!: (value: string) => void;
    const read = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
    const fact = {
      fileEntryId: FILE_ENTRY_ID,
      mediaType: 'image/png',
      name: 'managed.png',
      size: 128,
    };
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).script(() => {
      throw new Error('Runtime must not start after an image read is cancelled.');
    });
    const host = createHost(runtime, noOpNaming, {
      readAsDataUrl: async (_file, signal) => {
        readSignal = signal;
        return read;
      },
      resolveAvailable: async () => new Map([[FILE_ENTRY_ID, fact]]),
    });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));

    const submitted = await host.submitMessage({
      sessionId: session.id,
      parts: [{ type: 'file', fileEntryId: FILE_ENTRY_ID, mediaType: 'image/png' }],
    });
    await waitFor(() => readSignal !== undefined, 'the managed image read');
    await host.cancelTurn({ sessionId: session.id, turnId: submitted.turnId });
    expect(readSignal?.aborted).toBe(true);
    resolveRead('data:image/png;base64,LATE');
    await waitFor(
      () => terminalTurnEvent(events)?.turn.status === 'cancelled',
      'the cancelled image turn',
    );

    expect(JSON.stringify(await store.listMessages(session.id))).not.toContain('LATE');
  });

  test('rejects unavailable and forged managed-file input before reservation', async () => {
    const facts = new Map([
      [
        FILE_ENTRY_ID,
        {
          fileEntryId: FILE_ENTRY_ID,
          mediaType: 'image/png',
          name: 'managed.png',
          size: 128,
        },
      ],
    ]);
    const availableHost = createHost(new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }), noOpNaming, {
      readAsDataUrl: async () => 'data:image/png;base64,AAAA',
      resolveAvailable: async () => facts,
    });
    const availableSession = await availableHost.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });

    await expect(
      availableHost.submitMessage({
        sessionId: availableSession.id,
        parts: [
          {
            type: 'file',
            fileEntryId: FILE_ENTRY_ID,
            mediaType: 'image/jpeg',
            name: 'forged.jpg',
          },
        ],
      }),
    ).rejects.toMatchObject({ view: { code: 'ATTACHMENT_METADATA_MISMATCH' } });
    expect(await store.listMessages(availableSession.id)).toEqual([]);

    const unavailableHost = createHost(
      new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }),
      noOpNaming,
      noFiles,
    );
    const unavailableSession = await unavailableHost.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    await expect(
      unavailableHost.submitMessage({
        sessionId: unavailableSession.id,
        parts: [{ type: 'file', fileEntryId: FILE_ENTRY_ID, mediaType: 'image/png' }],
      }),
    ).rejects.toMatchObject({ view: { code: 'ATTACHMENT_UNAVAILABLE' } });
    expect(await store.listMessages(unavailableSession.id)).toEqual([]);
  });

  test('fails closed on unknown sessions, agents, and unsupported input', async () => {
    const host = hostWithText(['unused']);

    await expect(
      host.createSession({ agentId: 'missing', executionTarget: { kind: 'local' } }),
    ).rejects.toMatchObject({ view: { code: 'AGENT_NOT_FOUND' } });
    await expect(
      host.submitMessage({ sessionId: 'missing', parts: [{ type: 'text', text: 'x' }] }),
    ).rejects.toMatchObject({ view: { code: 'SESSION_NOT_FOUND' } });
    await expect(host.observeSession('missing', () => {})).rejects.toMatchObject({
      view: { code: 'SESSION_NOT_FOUND' },
    });

    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    // Raw or unknown ids are rejected before any reservation.
    await expect(
      host.submitMessage({
        sessionId: session.id,
        parts: [{ type: 'file', fileEntryId: 'file:///private/image.png', mediaType: 'image/png' }],
      }),
    ).rejects.toMatchObject({ view: { code: 'ATTACHMENT_UNAVAILABLE' } });
    expect(await store.listMessages(session.id)).toEqual([]);

    // Rename and delete round out the session lifecycle.
    const renamed = await host.renameSession({ sessionId: session.id, title: 'My Chat' });
    expect(renamed.title).toBe('My Chat');
    expect(renamed.titleIsManual).toBe(true);
    await host.deleteSession({ sessionId: session.id });
    await expect(host.observeSession(session.id, () => {})).rejects.toMatchObject({
      view: { code: 'SESSION_NOT_FOUND' },
    });
  });
});
