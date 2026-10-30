// Executed only by the owning Jest suite. Native ESM exercises the published Web SDK entry.
import assert from 'node:assert/strict';

import { streamSimple } from '@earendil-works/pi-ai/api/google-vertex';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

globalThis.fetch = async () => {
  throw new Error('The adapter must use its injected transport.');
};

const model = {
  api: 'google-vertex',
  provider: 'test-vertex',
  id: 'gemini-2.5-flash',
  name: 'Gemini',
  baseUrl: 'https://aiplatform.googleapis.com/v1/projects/project-id/locations/global',
  reasoning: true,
  input: ['text', 'image'],
  contextWindow: 32000,
  maxTokens: 2048,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const context = normalizeContext({
  systemPrompt: 'Use the weather tool.',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Paris weather?' },
        { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
      ],
      timestamp: 1,
    },
  ],
  tools: [
    {
      name: 'weather',
      description: 'Read weather',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    },
  ],
});
let captured;
const response = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [
          { text: 'Thinking', thought: true, thoughtSignature: 'thought-signature' },
          {
            functionCall: { name: 'weather', args: { city: 'Paris' } },
            thoughtSignature: 'call-signature',
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 13 },
};
const source = streamSimple(model, context, {
  accessToken: 'host-token',
  maxRetries: 0,
  maxTokens: 512,
  headers: { 'x-goog-api-key': 'conflicting-key', 'X-Custom': 'kept' },
  fetch: async (url, init) => {
    captured = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(init.body),
    };
    return new Response(`data: ${JSON.stringify(response)}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  },
});
const result = await source.result();
assert.equal(result.stopReason, 'toolUse', result.errorMessage);
assert.equal(
  captured.url,
  `${model.baseUrl}/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
);
assert.equal(captured.headers.get('authorization'), 'Bearer host-token');
assert.equal(captured.headers.has('x-goog-api-key'), false);
assert.equal(captured.headers.get('x-custom'), 'kept');
assert.equal(captured.body.generationConfig.maxOutputTokens, 512);
assert.equal(captured.body.tools[0].functionDeclarations[0].name, 'weather');
assert.ok(
  captured.body.contents[0].parts.some((part) => part.inlineData?.mimeType === 'image/png'),
);
assert.ok(
  result.content.some(
    (part) => part.type === 'thinking' && part.thinkingSignature === 'thought-signature',
  ),
);
assert.ok(
  result.content.some(
    (part) =>
      part.type === 'toolCall' && part.name === 'weather' && part.arguments.city === 'Paris',
  ),
);
assert.equal(result.usage.input, 10);

const forbidden = await streamSimple(model, context, {
  accessToken: 'host-token',
  maxRetries: 0,
  fetch: async () =>
    new Response(
      JSON.stringify({
        error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' },
      }),
      { status: 403 },
    ),
}).result();
assert.equal(forbidden.stopReason, 'error');
assert.ok(forbidden.errorMessage.includes('403'));
assert.ok(JSON.stringify(forbidden.diagnostics).includes('403'));

const controller = new AbortController();
controller.abort();
let called = false;
const aborted = await streamSimple(model, context, {
  accessToken: 'host-token',
  signal: controller.signal,
  maxRetries: 0,
  fetch: async () => {
    called = true;
    throw new Error('must not request');
  },
}).result();
assert.equal(aborted.stopReason, 'aborted');
assert.equal(called, false);
process.stdout.write('ok');
