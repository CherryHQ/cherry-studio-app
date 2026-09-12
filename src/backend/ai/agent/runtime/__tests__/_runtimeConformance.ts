/**
 * Reusable Agent Runtime conformance suite.
 *
 * `describeRuntimeConformance` covers the executable items from the "Conformance"
 * section of `docs/references/agent/agent-runtime.md`. Any {@link AgentRuntime}
 * implementation plugs in by supplying a {@link RuntimeConformanceHarness}: the
 * suite drives the runtime only through the public contract, while the harness
 * arranges implementation-specific requests (a FakeRuntime scripts events; a
 * real Runtime configures a mock provider).
 *
 * This file is an underscore-prefixed shared harness, not a suite: Jest is
 * configured to skip `__tests__/_*` collection.
 */

import { readFileSync } from 'node:fs';

import type { AgentRuntime, RuntimeEvent, RuntimeExecutionRequest, RuntimeToolRef } from '../types';

export type ArrangedRequest = {
  request: RuntimeExecutionRequest;
};

export type ArrangedApprovalRequest = ArrangedRequest & {
  /** Stable identity and display snapshot carried by the approval. */
  toolRef: RuntimeToolRef;
  displayName: string;
  /** The tool call id carried by the tool part and its approval. */
  toolCallId: string;
  /** Reports whether the tool implementation actually ran. */
  toolExecuted: () => boolean;
};

export type ArrangedErrorRequest = ArrangedRequest & {
  /** A secret the native failure embeds; it must not survive normalization. */
  secret: string;
};

export interface RuntimeConformanceHarness {
  /** A fresh, independent runtime instance. Descriptor id/capabilities are stable across calls. */
  createRuntime(): AgentRuntime | Promise<AgentRuntime>;

  /**
   * A request the runtime accepts and runs to a successful `completed`. It must
   * emit at least one part via `part.add` and at least one `text.delta` or
   * `part.replace` that references an existing part id.
   */
  arrangeSuccess(runtime: AgentRuntime, turnId: string): ArrangedRequest | Promise<ArrangedRequest>;

  /**
   * A request that violates this runtime's capabilities. Return `null` when the
   * runtime supports every capability and no unsupported request can be built.
   */
  arrangeUnsupported(
    runtime: AgentRuntime,
    turnId: string,
  ): ArrangedRequest | null | Promise<ArrangedRequest | null>;

  /**
   * A request with exactly one `ask`-mode tool the run will call, so the run
   * emits `approval.requested` for that tool and turn.
   */
  arrangeApproval(
    runtime: AgentRuntime,
    turnId: string,
  ): ArrangedApprovalRequest | Promise<ArrangedApprovalRequest>;

  /** A request that stays non-terminal until the turn is cancelled. */
  arrangeCancellable(
    runtime: AgentRuntime,
    turnId: string,
  ): ArrangedRequest | Promise<ArrangedRequest>;

  /** A request whose native failure is normalized without leaking `secret`. */
  arrangeError(
    runtime: AgentRuntime,
    turnId: string,
  ): ArrangedErrorRequest | Promise<ArrangedErrorRequest>;

  /**
   * Absolute paths of the implementation's source files for the static import
   * check (item 11). When omitted, item 11 is skipped here and left to lint.
   */
  sourceFiles?: string[];
}

const TERMINAL_TYPES = new Set<RuntimeEvent['type']>(['completed', 'failed', 'cancelled']);

function isTerminal(event: RuntimeEvent): boolean {
  return TERMINAL_TYPES.has(event.type);
}

function isOutputEvent(event: RuntimeEvent): boolean {
  return event.type === 'part.add' || event.type === 'text.delta' || event.type === 'part.replace';
}

async function collect(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

/** Drive an iterator until (and including) the first event matching `predicate`. */
async function iterateUntil(
  iterator: AsyncIterator<RuntimeEvent>,
  predicate: (event: RuntimeEvent) => boolean,
): Promise<{ events: RuntimeEvent[]; matched: RuntimeEvent | undefined }> {
  const events: RuntimeEvent[] = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return { events, matched: undefined };
    }
    events.push(next.value);
    if (predicate(next.value)) {
      return { events, matched: next.value };
    }
  }
}

async function drainRest(iterator: AsyncIterator<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return events;
    }
    events.push(next.value);
  }
}

function collectPartIds(events: RuntimeEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'part.add') {
      ids.add(event.part.id);
    }
  }
  return ids;
}

export function describeRuntimeConformance(harness: RuntimeConformanceHarness): void {
  // 1. Descriptor id and capabilities are stable.
  test('descriptor id and capabilities are stable', async () => {
    const first = await harness.createRuntime();
    const second = await harness.createRuntime();

    expect(typeof first.descriptor.id).toBe('string');
    expect(first.descriptor.id.length).toBeGreaterThan(0);
    // Reading twice returns identical values.
    expect(first.descriptor).toEqual(first.descriptor);
    // A fresh instance advertises the same identity and capabilities.
    expect(second.descriptor.id).toBe(first.descriptor.id);
    expect(second.descriptor.capabilities).toEqual(first.descriptor.capabilities);

    const capabilities = first.descriptor.capabilities;
    expect(typeof capabilities.reasoning).toBe('boolean');
    expect(typeof capabilities.tools).toBe('boolean');
    expect(typeof capabilities.approvals).toBe('boolean');
    expect(typeof capabilities.attachments).toBe('boolean');

    const preflight = await first.preflightModel({ providerId: 'provider', modelId: 'model' });
    expect(preflight.contextWindow).toBeGreaterThan(0);
    expect(preflight.maxInputTokens).toBeGreaterThanOrEqual(0);
    expect(preflight.maxOutputTokens).toBeGreaterThan(0);
    expect(preflight.inputModalities).toContain('text');
    expect(typeof preflight.supportsTools).toBe('boolean');
  });

  // 2 & 3. Exactly one terminal event, and nothing follows it.
  test('a valid request reaches exactly one terminal event with no trailing output', async () => {
    const runtime = await harness.createRuntime();
    const { request } = await harness.arrangeSuccess(runtime, 'turn-success');
    const session = await runtime.open();
    try {
      const events = await collect(session.execute(request));

      const terminalIndices = events
        .map((event, index) => (isTerminal(event) ? index : -1))
        .filter((index) => index >= 0);
      expect(terminalIndices).toHaveLength(1);
      // The single terminal is the last event; nothing follows it.
      expect(terminalIndices[0]).toBe(events.length - 1);
    } finally {
      await session.close();
    }
  });

  test('accepts grouped history and an opaque context checkpoint', async () => {
    const runtime = await harness.createRuntime();
    const { request } = await harness.arrangeSuccess(runtime, 'turn-context-checkpoint');
    request.history = [
      {
        turnId: 'turn-after-anchor',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Retained input.' }] }],
      },
    ];
    request.contextCheckpoint = {
      version: 1,
      anchorTurnId: 'turn-anchor',
      payload: { summary: 'Earlier input.' },
    };
    const session = await runtime.open();
    try {
      const events = await collect(session.execute(request));

      expect(events.at(-1)?.type).toBe('completed');
    } finally {
      await session.close();
    }
  });

  // 4. Text deltas and part replacements address existing stable part ids.
  test('text deltas and part replacements address existing part ids', async () => {
    const runtime = await harness.createRuntime();
    const { request } = await harness.arrangeSuccess(runtime, 'turn-parts');
    const session = await runtime.open();
    try {
      const events = await collect(session.execute(request));
      const partIds = collectPartIds(events);

      let referencingEvents = 0;
      for (const event of events) {
        if (event.type === 'text.delta') {
          referencingEvents += 1;
          expect(partIds.has(event.partId)).toBe(true);
        }
        if (event.type === 'part.replace') {
          referencingEvents += 1;
          expect(partIds.has(event.part.id)).toBe(true);
        }
      }
      // The success arrangement must actually exercise a referencing event.
      expect(referencingEvents).toBeGreaterThan(0);
    } finally {
      await session.close();
    }
  });

  // 5. Unsupported input or tools fail before partial execution.
  test('unsupported input or tools fail before any partial execution', async () => {
    const runtime = await harness.createRuntime();
    const arranged = await harness.arrangeUnsupported(runtime, 'turn-unsupported');
    if (!arranged) {
      // Runtime supports every capability; nothing to reject.
      return;
    }
    const session = await runtime.open();
    try {
      const events = await collect(session.execute(arranged.request));

      // No output part is emitted before failure.
      expect(events.some(isOutputEvent)).toBe(false);
      const terminal = events.at(-1);
      expect(terminal?.type).toBe('failed');
      expect(events.filter(isTerminal)).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  // 6. cancel is idempotent and settles the active turn as cancelled.
  test('cancel is idempotent and settles the active turn as cancelled', async () => {
    const runtime = await harness.createRuntime();
    const { request } = await harness.arrangeCancellable(runtime, 'turn-cancel');
    const session = await runtime.open();
    try {
      const iterator = session.execute(request)[Symbol.asyncIterator]();
      // Advance until a non-terminal event proves the turn is running.
      const firstNonTerminal = await iterateUntil(iterator, (event) => !isTerminal(event));
      expect(firstNonTerminal.matched).toBeDefined();

      await session.cancel(request.turnId);
      // A second cancel is a no-op.
      await session.cancel(request.turnId);

      const rest = await drainRest(iterator);
      const all = [...firstNonTerminal.events, ...rest];
      const terminals = all.filter(isTerminal);
      expect(terminals).toHaveLength(1);
      expect(terminals[0]?.type).toBe('cancelled');
      if (request.tools.length > 0) {
        expect(
          all.find(
            (event) =>
              event.type === 'part.replace' &&
              event.part.type === 'tool' &&
              event.part.state === 'interrupted',
          ),
        ).toMatchObject({
          part: {
            output: {
              artifacts: [],
              value: { status: 'interrupted' },
            },
          },
        });
      }
    } finally {
      await session.close();
    }
  });

  // 7. Approval is requested only for an ask tool and correlates to the turn/call.
  test('approval is requested only for an ask tool and correlates to the active turn', async () => {
    const runtime = await harness.createRuntime();
    const arranged = await harness.arrangeApproval(runtime, 'turn-approve');
    const session = await runtime.open();
    try {
      const iterator = session.execute(arranged.request)[Symbol.asyncIterator]();
      const untilApproval = await iterateUntil(
        iterator,
        (event) => event.type === 'approval.requested',
      );
      const requested = untilApproval.matched;
      expect(requested?.type).toBe('approval.requested');
      if (requested?.type !== 'approval.requested') {
        throw new Error('expected an approval.requested event');
      }
      expect(requested.approval.turnId).toBe(arranged.request.turnId);
      expect(requested.approval.toolRef).toEqual(arranged.toolRef);
      expect(requested.approval.displayName).toBe(arranged.displayName);
      expect(requested.approval.toolCallId).toBe(arranged.toolCallId);

      await session.respondApproval({
        turnId: arranged.request.turnId,
        approvalId: requested.approval.id,
        decision: 'approve',
      });

      const rest = await drainRest(iterator);
      const all = [...untilApproval.events, ...rest];
      // Exactly one approval request, and only for the ask tool.
      const requests = all.filter((event) => event.type === 'approval.requested');
      expect(requests).toHaveLength(1);
      expect(all.filter(isTerminal)).toHaveLength(1);
      expect(arranged.toolExecuted()).toBe(true);
    } finally {
      await session.close();
    }
  });

  // 8. Denied tools are never executed.
  test('denied tools are never executed', async () => {
    const runtime = await harness.createRuntime();
    const arranged = await harness.arrangeApproval(runtime, 'turn-deny');
    const session = await runtime.open();
    try {
      const iterator = session.execute(arranged.request)[Symbol.asyncIterator]();
      const untilApproval = await iterateUntil(
        iterator,
        (event) => event.type === 'approval.requested',
      );
      const requested = untilApproval.matched;
      if (requested?.type !== 'approval.requested') {
        throw new Error('expected an approval.requested event');
      }

      await session.respondApproval({
        turnId: arranged.request.turnId,
        approvalId: requested.approval.id,
        decision: 'deny',
      });

      const rest = await drainRest(iterator);
      const all = [...untilApproval.events, ...rest];
      expect(all.filter(isTerminal)).toHaveLength(1);
      expect(arranged.toolExecuted()).toBe(false);
      expect(
        all.find(
          (event) =>
            event.type === 'part.replace' &&
            event.part.type === 'tool' &&
            event.part.state === 'denied',
        ),
      ).toMatchObject({
        part: {
          output: {
            artifacts: [],
            value: { status: 'denied' },
          },
        },
      });
    } finally {
      await session.close();
    }
  });

  // 9. close is idempotent and releases resources.
  test('close is idempotent and releases resources', async () => {
    const runtime = await harness.createRuntime();
    const session = await runtime.open();
    await expect(session.close()).resolves.toBeUndefined();
    // A second close does not throw.
    await expect(session.close()).resolves.toBeUndefined();

    // After close the session no longer accepts execution.
    const { request } = await harness.arrangeSuccess(runtime, 'turn-after-close');
    expect(() => session.execute(request)).toThrow();
  });

  // 10. Native errors are normalized without secrets or stack traces.
  test('native errors are normalized without secrets or stack traces', async () => {
    const runtime = await harness.createRuntime();
    const arranged = await harness.arrangeError(runtime, 'turn-error');
    const session = await runtime.open();
    try {
      const events = await collect(session.execute(arranged.request));
      const failure = events.find((event) => event.type === 'failed');
      expect(failure?.type).toBe('failed');
      if (failure?.type !== 'failed') {
        throw new Error('expected a failed event');
      }
      const error = failure.error;
      expect(typeof error.code).toBe('string');
      expect(typeof error.message).toBe('string');
      expect(typeof error.retryable).toBe('boolean');

      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(arranged.secret);
      expect(Object.keys(error)).toEqual(expect.arrayContaining(['code', 'message', 'retryable']));
      expect(
        Object.keys(error).every((key) =>
          ['code', 'context', 'message', 'name', 'origin', 'retryable'].includes(key),
        ),
      ).toBe(true);
      expect(error).not.toHaveProperty('stack');
      if (error.context) {
        expect(
          Object.keys(error.context).every((key) =>
            ['finishReason', 'modelId', 'providerId', 'responseBody', 'statusCode'].includes(key),
          ),
        ).toBe(true);
        expect(error.context).not.toHaveProperty('stack');
      }
      expect(serialized).not.toContain('\n    at ');
    } finally {
      await session.close();
    }
  });

  // 11. No application protocol, persistence, React, or Expo imports.
  const sourceFiles = harness.sourceFiles;
  if (sourceFiles && sourceFiles.length > 0) {
    test('imports no application protocol, persistence, React, or Expo module', () => {
      const bannedPatterns: RegExp[] = [
        /\breact\b/,
        /\breact-native\b/,
        /\bexpo\b/,
        /\bexpo-/,
        /@expo\//,
        /@react-navigation\//,
        /\bexpo-sqlite\b/,
        /\bdrizzle-orm\b/,
        /@\/backend\/data\b/,
        /@\/backend\/services\b/,
        /@\/frontend\b/,
        /@\/app\b/,
        /agent-protocol/,
      ];
      const importSpecifier =
        /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

      for (const file of sourceFiles) {
        const source = readFileSync(file, 'utf8');
        let match: RegExpExecArray | null;
        while ((match = importSpecifier.exec(source)) !== null) {
          const specifier = match[1] ?? match[2] ?? '';
          const violated = bannedPatterns.find((pattern) => pattern.test(specifier));
          expect(violated ? `${specifier} (${violated.source})` : specifier).toBe(specifier);
        }
      }
    });
  } else {
    test.skip('imports no application protocol, persistence, React, or Expo module (enforced by lint)', () => {
      // Enforced by the ESLint boundary rule for src/backend/ai/agent/runtime/**.
    });
  }
}
