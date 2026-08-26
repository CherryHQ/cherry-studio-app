/**
 * End-to-end behavior of the Mobile Agent Host against the process-local
 * reference store and the Runtime contract. Pi-native mapping has its own
 * conformance suite; durable-adapter behavior is outside this suite.
 */

import {
  FakeRuntime,
  type RuntimeExecutionRequest,
  type RuntimeTool,
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
import { createUniqueModelId } from '@/shared/data/types/model';

import type { AgentDefinitionSource } from '../agentDefinitions';
import type { AgentSessionNaming } from '../AgentSessionNaming';
import { InMemoryAgentSessionStore } from '../InMemoryAgentSessionStore';
import { MobileAgentHost } from '../MobileAgentHost';

const AGENT_ID = 'agent-under-test';
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
  capabilities: { reasoning: true, tools: true, approvals: true, attachments: false },
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

const inferenceModel = async (model: { providerId: string; modelId: string }) => ({
  uniqueModelId: createUniqueModelId(model.providerId, model.modelId),
  providerId: model.providerId,
  modelId: model.modelId,
  apiModelId: `${model.modelId}-api`,
  name: model.modelId === 'mock-model' ? 'Mock Model' : 'Override Model',
});

type HostToolOverrides = {
  modelSupportsTools?: () => Promise<boolean>;
  resolveRuntimeTools?: () => Promise<RuntimeTool[]>;
};

function createHost(
  runtime: FakeRuntime,
  naming: NamingOverride = noOpNaming,
  resolveInferenceModel = inferenceModel,
  toolOverrides: HostToolOverrides = {},
): MobileAgentHost {
  return new MobileAgentHost(
    store,
    unusedAiService,
    unusedPreferenceService,
    backgroundReply,
    runtime,
    {
      agents,
      inferenceModel: resolveInferenceModel,
      modelSupportsTools: toolOverrides.modelSupportsTools ?? (async () => true),
      naming,
      runtimeTools: {
        resolve: toolOverrides.resolveRuntimeTools ?? (async () => []),
      },
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
      attachments: false,
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
    expect(finalized.message).toMatchObject({
      modelId: 'mock-provider::mock-model',
      inferenceSnapshot: {
        status: 'supported',
        snapshot: {
          version: 1,
          model: {
            uniqueModelId: 'mock-provider::mock-model',
            providerId: 'mock-provider',
            modelId: 'mock-model',
            apiModelId: 'mock-model-api',
            name: 'Mock Model',
          },
          reasoningEffort: 'low',
          parameters: { maxOutputTokens: 512, temperature: 0.2 },
          tools: [],
        },
      },
    });
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
    expect(requests[1]?.history.map((message) => message.role)).toEqual(['user', 'assistant']);
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

    const assistantSnapshots = (await store.listMessages(session.id))
      .filter((message) => message.role === 'assistant')
      .map((message) => message.inferenceSnapshot);
    expect(assistantSnapshots).toMatchObject([
      {
        status: 'supported',
        snapshot: {
          model: { uniqueModelId: 'override-provider::override-model' },
          reasoningEffort: 'max',
          parameters: { maxOutputTokens: 512, temperature: 0.2 },
          tools: [],
        },
      },
      {
        status: 'supported',
        snapshot: {
          model: { uniqueModelId: 'mock-provider::mock-model' },
          parameters: { maxOutputTokens: 512, temperature: 0.2 },
          tools: [],
        },
      },
      {
        status: 'supported',
        snapshot: {
          model: { uniqueModelId: 'mock-provider::mock-model' },
          reasoningEffort: 'low',
          parameters: { maxOutputTokens: 512, temperature: 0.2 },
          tools: [],
        },
      },
    ]);
  });

  test('rejects an unavailable model before reserving transcript rows', async () => {
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR });
    const host = createHost(runtime, noOpNaming, async () => {
      throw new Error('credential-secret from provider lookup');
    });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });

    await expect(
      host.submitMessage({
        sessionId: session.id,
        parts: [{ type: 'text', text: 'Do not reserve this.' }],
      }),
    ).rejects.toMatchObject({
      view: {
        code: 'EXECUTION_UNAVAILABLE',
        message: 'The selected model is unavailable.',
      },
    });
    await expect(store.listMessages(session.id)).resolves.toEqual([]);
  });

  test('freezes configured tools into Runtime input and the persisted inference snapshot', async () => {
    const requests: RuntimeExecutionRequest[] = [];
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR }).script((controller) => {
      requests.push(controller.request);
      controller.emit({ type: 'completed' });
    });
    const tool: RuntimeTool = {
      approval: 'ask',
      description: 'Search a remote catalog.',
      displayName: 'Search',
      execute: async () => ({ artifacts: [], value: { found: true } }),
      inputSchema: { type: 'object' },
      providerName: 'mcp_search_abc1234',
      ref: { source: 'mcp', serverId: 'server-1', rawToolName: 'search' },
    };
    let configuredTools = [tool];
    const host = createHost(runtime, noOpNaming, inferenceModel, {
      resolveRuntimeTools: async () => configuredTools.slice(),
    });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });
    const events: AgentEvent[] = [];
    await host.observeSession(session.id, (event) => events.push(event));

    await host.submitMessage({
      parts: [{ type: 'text', text: 'Search.' }],
      sessionId: session.id,
    });
    configuredTools = [];
    await waitFor(() => terminalTurnEvent(events) !== undefined, 'the tool snapshot turn');

    expect(requests[0]?.tools).toEqual([tool]);
    const transcript = await store.listMessages(session.id);
    expect(transcript[1]?.inferenceSnapshot).toMatchObject({
      status: 'supported',
      snapshot: {
        tools: [
          {
            approval: 'ask',
            displayName: 'Search',
            providerName: 'mcp_search_abc1234',
            ref: tool.ref,
          },
        ],
      },
    });
  });

  test('rejects configured tools for an unsupported model before reserving messages', async () => {
    const runtime = new FakeRuntime({ descriptor: FAKE_DESCRIPTOR });
    const host = createHost(runtime, noOpNaming, inferenceModel, {
      modelSupportsTools: async () => false,
      resolveRuntimeTools: async () => [
        {
          approval: 'ask',
          description: 'Search.',
          displayName: 'Search',
          execute: async () => ({ artifacts: [], value: null }),
          inputSchema: { type: 'object' },
          providerName: 'mcp_search_abc1234',
          ref: { source: 'mcp', serverId: 'server-1', rawToolName: 'search' },
        },
      ],
    });
    const session = await host.createSession({
      agentId: AGENT_ID,
      executionTarget: { kind: 'local' },
    });

    await expect(
      host.submitMessage({
        parts: [{ type: 'text', text: 'Do not reserve this.' }],
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({
      view: {
        code: 'CAPABILITY_UNSUPPORTED',
        message: 'The selected model does not support native tool calling.',
      },
    });
    await expect(store.listMessages(session.id)).resolves.toEqual([]);
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
      modelId: 'mock-provider::mock-model',
      inferenceSnapshot: {
        version: 1,
        model: {
          uniqueModelId: 'mock-provider::mock-model',
          providerId: 'mock-provider',
          modelId: 'mock-model',
          name: 'Mock Model',
        },
        parameters: {},
        tools: [],
      },
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
    // attachments: false — file input is rejected before any reservation.
    await expect(
      host.submitMessage({
        sessionId: session.id,
        parts: [{ type: 'file', fileEntryId: 'file-1', mediaType: 'image/png' }],
      }),
    ).rejects.toMatchObject({ view: { code: 'CAPABILITY_UNSUPPORTED' } });
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
