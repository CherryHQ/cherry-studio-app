/**
 * End-to-end behavior of the Mobile Agent Host against the process-local
 * reference store, real Router and registry, and real AiSdkRuntime driven by a
 * mock language model. Durable-adapter behavior is outside this suite.
 */

import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

import { AiSdkRuntime, FakeRuntime } from '@/backend/ai/agent';
import { AgentEventSchema, AgentProtocolError, type AgentEvent } from '@/shared/contracts/agent';

import type { AgentDefinitionSource } from '../agentDefinitions';
import { InMemoryAgentSessionStore } from '../InMemoryAgentSessionStore';
import { MobileAgentHost } from '../MobileAgentHost';
import { AgentRuntimeRegistry, createAgentRuntimeRouter } from '../runtimeRouting';

const AGENT_ID = 'agent-under-test';

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
    };
  },
};

function v3Usage(inputTokens: number, outputTokens: number): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: outputTokens, text: undefined, reasoning: undefined },
  };
}

function textStreamParts(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    ...[...text].map(
      (char): LanguageModelV3StreamPart => ({ type: 'text-delta', id: 't1', delta: char }),
    ),
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: v3Usage(3, 2) },
  ];
}

function hostWithModel(model: MockLanguageModelV3): MobileAgentHost {
  const runtime = new AiSdkRuntime({ resolveModel: () => ({ model }) });
  const registry = new AgentRuntimeRegistry().register(runtime);
  return new MobileAgentHost(store, { agents, router: createAgentRuntimeRouter(registry) });
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
    store = new InMemoryAgentSessionStore();
  });

  test('runs basic chat end to end: create, observe, submit, stream, record', async () => {
    let call = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream(textStreamParts(call++ === 0 ? 'Hi' : 'Ok')),
      }),
    });
    const host = hostWithModel(model);

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
    expect(finalized.message.status).toBe('success');
    expect(finalized.message.parts).toEqual([
      { id: 'text-t1', type: 'text', text: 'Hi', state: 'done' },
    ]);
    expect(finalized.message.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });

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

    // The model saw instructions + the turn input.
    expect(model.doStreamCalls[0]?.prompt.map((message) => message.role)).toEqual([
      'system',
      'user',
    ]);

    // A second turn feeds the stored transcript back as history.
    const secondEvents: AgentEvent[] = [];
    const second = await host.observeSession(session.id, (event) => secondEvents.push(event));
    expect(second.snapshot.activeTurn).toBeNull();
    await host.submitMessage({ sessionId: session.id, parts: [{ type: 'text', text: 'More.' }] });
    await waitFor(() => terminalTurnEvent(secondEvents) !== undefined, 'the second turn');
    expect(model.doStreamCalls[1]?.prompt.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
  });

  test('cancel settles the turn as cancelled and is idempotent', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't1' });
            controller.enqueue({ type: 'text-delta', id: 't1', delta: 'Working' });
            // Never closes; only cancellation settles the turn.
          },
        }),
      }),
    });
    const host = hostWithModel(model);
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
      { id: 'text-t1', type: 'text', text: 'Working', state: 'done' },
    ]);

    // Idempotent: cancelling a settled turn is a no-op, not an error.
    await expect(
      host.cancelTurn({ sessionId: session.id, turnId: submitted.turnId }),
    ).resolves.toBeUndefined();

    // The session is idle again.
    const observation = await host.observeSession(session.id, () => {});
    expect(observation.snapshot.activeTurn).toBeNull();
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

    const host = hostWithModel(new MockLanguageModelV3());
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
    const fake = new FakeRuntime({
      descriptor: {
        id: 'ai-sdk',
        name: 'Scripted Runtime',
        capabilities: { reasoning: true, tools: true, approvals: true, attachments: false },
      },
    }).script(async (controller) => {
      executionStarted?.();
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const registry = new AgentRuntimeRegistry().register(fake);
    const host = new MobileAgentHost(store, {
      agents,
      router: createAgentRuntimeRouter(registry),
    });
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

  test('maps runtime approvals onto protocol approvals and correlates responses', async () => {
    const fake = new FakeRuntime({
      descriptor: {
        // Registered under the ai-sdk route: the Router resolves by id only.
        id: 'ai-sdk',
        name: 'Scripted Runtime',
        capabilities: { reasoning: true, tools: true, approvals: true, attachments: false },
      },
    });
    fake.script(async (controller) => {
      const approvalId = 'approval-1';
      controller.emit({
        type: 'part.add',
        index: 0,
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId: 'call-1',
          toolName: 'delete_file',
          state: 'awaiting-approval',
          input: { path: '/tmp/x' },
          approvalId,
        },
      });
      controller.emit({
        type: 'approval.requested',
        approval: {
          id: approvalId,
          turnId: controller.turnId,
          toolCallId: 'call-1',
          toolName: 'delete_file',
          input: { path: '/tmp/x' },
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
          toolName: 'delete_file',
          input: { path: '/tmp/x' },
          status: decision === 'approve' ? 'approved' : 'denied',
        },
      });
      controller.emit({
        type: 'part.replace',
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId: 'call-1',
          toolName: 'delete_file',
          state: decision === 'approve' ? 'output-available' : 'denied',
          input: { path: '/tmp/x' },
          output: decision === 'approve' ? { deleted: true } : undefined,
        },
      });
      controller.emit({ type: 'completed' });
    });
    const registry = new AgentRuntimeRegistry().register(fake);
    const host = new MobileAgentHost(store, {
      agents,
      router: createAgentRuntimeRouter(registry),
    });

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
    const host = hostWithModel(new MockLanguageModelV3());

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
        parts: [{ type: 'file', mediaType: 'image/png', uri: 'file:///x.png' }],
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
