import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { createTraceRecorder } from '../../../../observability/__tests__/_traceRecorder';
import { tracePiStream } from '../tracePiStream';

const model: Parameters<StreamFn>[0] = {
  api: 'openai-responses',
  provider: 'provider',
  id: 'model',
  name: 'Model',
  baseUrl: 'https://example.test',
  reasoning: false,
  input: ['text'],
  contextWindow: 4096,
  maxTokens: 256,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const message: AssistantMessage = {
  role: 'assistant',
  api: model.api,
  provider: model.provider,
  model: model.id,
  content: [{ type: 'text', text: 'private response' }],
  stopReason: 'stop',
  timestamp: 1,
  usage: {
    input: 3,
    output: 2,
    cacheRead: 4,
    cacheWrite: 1,
    totalTokens: 10,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
};

describe('tracePiStream', () => {
  it('preserves the stream and every event while capturing only request diagnostics', async () => {
    const { traces, records } = createTraceRecorder();
    const root = traces.startTrace('turn');
    const source = new AssistantMessageEventStream();
    const observed = await tracePiStream(() => source, root)(model, {
      messages: [{ role: 'user', content: 'private prompt', timestamp: 1 }],
    });
    expect(observed).toBe(source);
    const start = { type: 'start', partial: message } as const;
    const done = { type: 'done', reason: 'stop', message } as const;
    source.push(start);
    source.push(done);
    const events = [];
    for await (const event of observed) events.push(event);
    expect(events).toEqual([start, done]);
    expect(await observed.result()).toBe(message);
    root?.end('ok');
    expect(
      records.find((record) => record.name === 'pi.generate_content' && record.revision === 2),
    ).toMatchObject({
      status: 'ok',
      parentSpanId: root?.spanId,
      attributes: { 'gen_ai.response.finish_reason': 'stop' },
    });
    expect(JSON.stringify(records)).not.toContain('private');
    expect(JSON.stringify(records)).not.toContain('gen_ai.usage');
  });

  it('keeps cancellation terminal when a provider resolves late', async () => {
    const { traces, records } = createTraceRecorder();
    const root = traces.startTrace('turn');
    const source = new AssistantMessageEventStream();
    await tracePiStream(() => source, root)(model, { messages: [] });
    root?.end('cancelled');
    source.push({ type: 'done', reason: 'stop', message });
    await source.result();
    expect(
      records.filter((record) => record.revision === 2).map((record) => record.status),
    ).toEqual(['cancelled', 'cancelled']);
  });

  it('preserves synchronous provider failures and omits their sensitive messages', async () => {
    const { traces, records } = createTraceRecorder();
    const root = traces.startTrace('turn');
    const failure = Object.assign(new Error('private credential'), { statusCode: 401 });
    const stream = tracePiStream(() => {
      throw failure;
    }, root);
    await expect(stream(model, { messages: [] })).rejects.toBe(failure);
    expect(records.at(-1)).toMatchObject({
      status: 'error',
      attributes: { 'http.status_code': 401 },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });
});
