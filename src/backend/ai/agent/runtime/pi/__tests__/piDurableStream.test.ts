import type { Api, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { piDurableSetupError, protectPiDurableStream } from '../piDurableStream';
import { emptyAssistantMessage } from '../piStreamEvents';

const model: Model<Api> = {
  api: 'openai-responses',
  provider: 'provider',
  id: 'model',
  name: 'Model',
  baseUrl: '',
  contextWindow: 32768,
  maxTokens: 4096,
  input: ['text'],
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

async function collect(stream: AsyncIterable<AssistantMessageEvent>) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('durable provider diagnostics', () => {
  test('redacts credentials before native progress and terminal persistence without changing model content', async () => {
    const message = {
      ...emptyAssistantMessage(model),
      content: [
        { type: 'text' as const, text: 'Original response.', textSignature: 'opaque-signature' },
      ],
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { message: 'Provider rejected selected-secret', stack: 'private-stack' },
          details: {
            headers: { Authorization: 'Bearer selected-secret', cookie: 'private-cookie' },
            body: ['Provider echoed selected-secret', { apiKey: 'unknown-secret' }],
            empty: '',
          },
        },
      ],
    };
    const failed = {
      ...message,
      stopReason: 'error' as const,
      errorMessage: '429: selected-secret',
    };
    const source = new AssistantMessageEventStream();
    source.push({ type: 'start', partial: message });
    source.push({ type: 'error', reason: 'error', error: failed });
    const events = await collect(protectPiDurableStream(source, model, ['selected-secret']));
    const serialized = JSON.stringify(events);
    for (const secret of ['selected-secret', 'private-cookie', 'unknown-secret', 'private-stack'])
      expect(serialized).not.toContain(secret);
    expect(serialized).toContain('[REDACTED]');
    expect(events[0]).toMatchObject({
      partial: { content: message.content, diagnostics: [{ details: { empty: '' } }] },
    });
    expect(events[1]).toMatchObject({
      type: 'error',
      error: { stopReason: 'error', errorMessage: '429: [REDACTED]' },
    });
    // Provider accumulators and signatures are not mutated by the durable-storage adapter.
    expect(failed.errorMessage).toBe('429: selected-secret');
    expect(message.diagnostics[0]?.error.stack).toBe('private-stack');
  });

  test('setup failure retains bounded status and retry facts without persisting raw error objects', async () => {
    const error = Object.assign(new Error('secret-key'), {
      status: 503,
      retryable: true,
      responseBody: 'upstream response: secret-key',
    });
    const events = await collect(piDurableSetupError(model, error, ['secret-key']));
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        reason: 'error',
        error: expect.objectContaining({
          errorMessage: '[REDACTED]',
          diagnostics: [
            expect.objectContaining({
              details: expect.objectContaining({
                status: 503,
                retryable: true,
                body: 'upstream response: [REDACTED]',
              }),
            }),
          ],
        }),
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('secret-key');
  });
});
