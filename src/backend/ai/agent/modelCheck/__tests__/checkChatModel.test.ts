import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import type { AgentRuntimeSession, RuntimeEvent, RuntimeExecutionRequest } from '../../runtime';
import { checkChatModel, classifyChatModelFailure } from '../checkChatModel';

const model = {
  id: createUniqueModelId('provider', 'chat'),
  modelId: 'chat',
  providerId: 'provider',
} as Model;

function createProbe(events: RuntimeEvent[]) {
  const requests: RuntimeExecutionRequest[] = [];
  const session: AgentRuntimeSession = {
    cancel: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
    execute: async function* (request) {
      requests.push(request);
      yield* events;
    },
    respondApproval: jest.fn(async () => undefined),
  };
  return {
    session,
    requests,
    runtime: { open: async () => session },
    onUsage: jest.fn(async () => undefined),
  };
}

describe('chat model connection probe', () => {
  test('uses the conversation runtime with no tools or prior messages and requires a real response', async () => {
    const probe = createProbe([
      {
        type: 'part.add',
        index: 0,
        part: { id: 'answer', type: 'text', text: 'OK', state: 'done' },
      },
      { type: 'completed' },
    ]);
    await expect(checkChatModel(probe.runtime, model, probe)).resolves.toMatchObject({
      status: 'success',
    });
    expect(probe.requests).toHaveLength(1);
    expect(probe.requests[0]).toMatchObject({
      model: { modelId: 'chat', providerId: 'provider' },
      history: [],
      tools: [],
      contextCheckpoint: null,
      options: { maxOutputTokens: 64 },
    });
    expect(probe.session.close).toHaveBeenCalledTimes(1);

    const empty = createProbe([{ type: 'completed' }]);
    await expect(checkChatModel(empty.runtime, model, empty)).resolves.toEqual({
      status: 'failed',
      reason: 'model',
    });
  });

  test('returns a closed failure reason instead of provider diagnostics', async () => {
    const probe = createProbe([
      {
        type: 'failed',
        error: {
          code: 'invalid_api_key',
          message: 'Private provider diagnostic',
          retryable: false,
          context: { statusCode: 401, responseBody: 'Private response' },
        },
      },
    ]);
    await expect(checkChatModel(probe.runtime, model, probe)).resolves.toEqual({
      status: 'failed',
      reason: 'authentication',
    });
  });

  test('closes a still-running provider request when the screen cancels', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = createProbe([]);
    probe.session.execute = async function* () {
      controller.abort(new Error('left-screen'));
      await waiting;
      yield { type: 'completed' };
    };
    probe.session.close = jest.fn(async () => {
      release();
    });
    await expect(
      checkChatModel(probe.runtime, model, { ...probe, signal: controller.signal }),
    ).rejects.toThrow('left-screen');
    expect(probe.session.close).toHaveBeenCalledTimes(1);
  });

  test('bounds a provider that never produces a terminal event', async () => {
    jest.useFakeTimers();
    const probe = createProbe([]);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    probe.session.execute = async function* () {
      await waiting;
      yield { type: 'cancelled' };
    };
    probe.session.close = jest.fn(async () => {
      release();
    });
    try {
      const result = checkChatModel(probe.runtime, model, { ...probe, timeoutMs: 30 });
      await jest.advanceTimersByTimeAsync(30);
      await expect(result).resolves.toEqual({ status: 'failed', reason: 'timeout' });
      expect(probe.session.close).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    ['insufficient_quota', 429, 'quota'],
    ['rate_limit_exceeded', 429, 'rateLimit'],
    ['forbidden', 403, 'permission'],
    ['model_not_found', 404, 'model'],
    ['network_error', undefined, 'network'],
  ] as const)('classifies %s for actionable recovery', (code, statusCode, reason) => {
    expect(
      classifyChatModelFailure({ code, context: { statusCode }, message: '', retryable: false }),
    ).toBe(reason);
  });
});
