import {
  ENDPOINT_TYPE,
  REASONING_FORMAT_PROFILES,
  selectFormatWire,
} from '@cherrystudio/provider-registry';
import type { FetchFunction, Model as PiModel } from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import type { Model } from '@/shared/data/types/model';

import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';

const model: PiModel<'anthropic-messages'> = {
  api: 'anthropic-messages',
  provider: 'vertex-account',
  id: 'claude-sonnet-4-5@20250929',
  name: 'Claude Sonnet',
  baseUrl: 'https://gateway.example/vertex/v1beta1',
  reasoning: true,
  input: ['text', 'image'],
  contextWindow: 32000,
  maxTokens: 8192,
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

async function bind(fetch: FetchFunction) {
  return bindPiStream(
    resolvePiApiAdapter(ENDPOINT_TYPE.ANTHROPIC_MESSAGES, 'google-vertex-anthropic'),
    {
      accessToken: 'host-token',
      vertex: { projectId: 'project-id', location: 'us-east5' },
      fetch,
      headers: { Authorization: 'wrong-token', 'X-Goog-Api-Key': 'wrong-key', 'X-App': 'Cherry' },
      maxRetries: 0,
      maxTokens: 4096,
      temperature: 0.5,
      requestParameters: {
        model: {
          modelId: model.id,
          reasoning: { selectableEfforts: ['high'], thinkingTokenLimits: { min: 1024, max: 8192 } },
        } as Model,
        profile: selectFormatWire(REASONING_FORMAT_PROFILES.anthropic, 'budget'),
        selection: 'high',
      },
    },
  );
}

describe('Vertex Claude official SDK integration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserves Pi tools, images, thinking signatures and usage through the Vertex SDK', async () => {
    const globalFetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected global transport'));
    const events = [
      {
        type: 'message_start',
        message: {
          id: 'msg-vertex',
          model: model.id,
          usage: { input_tokens: 12, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Read the weather.' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'signed-thinking' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_weather', name: 'weather', input: {} },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"city":"Paris"}' },
      },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } },
      { type: 'message_stop' },
    ];
    const fetch = jest.fn(
      async (_url: unknown, _init?: RequestInit) =>
        new Response(
          events
            .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
            .join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    );
    const stream = await bind(fetch);
    const source = await stream(model, context, {
      reasoning: 'high',
      headers: { 'x-api-key': 'wrong-request-key' },
      identity: { userAgent: { custom: 'CherryMobile/Test' } },
    });
    const result = await source.result();

    expect(result.stopReason).toBe('toolUse');
    expect(result.responseId).toBe('msg-vertex');
    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'thinking',
        thinking: 'Read the weather.',
        thinkingSignature: 'signed-thinking',
      }),
      expect.objectContaining({ type: 'toolCall', name: 'weather', arguments: { city: 'Paris' } }),
    ]);
    expect(result.usage).toMatchObject({ input: 12, output: 8, totalTokens: 20 });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      `${model.baseUrl}/projects/project-id/locations/us-east5/publishers/anthropic/models/${model.id}:streamRawPredict`,
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer host-token');
    for (const name of ['x-api-key', 'x-goog-api-key', 'api-key'])
      expect(headers.has(name)).toBe(false);
    expect(headers.get('x-app')).toBe('Cherry');
    expect(headers.get('user-agent')).toBe('CherryMobile/Test');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      anthropic_version: 'vertex-2023-10-16',
      stream: true,
      max_tokens: 4096,
      thinking: { type: 'enabled', budget_tokens: 4095 },
      tools: [expect.objectContaining({ name: 'weather' })],
    });
    expect(body).not.toHaveProperty('model');
    expect(body).not.toHaveProperty('temperature');
    expect(body.messages[0].content).toContainEqual(
      expect.objectContaining({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' },
      }),
    );
    expect(JSON.stringify(body)).not.toContain('host-token');
  });

  it('retains provider failure facts without retrying authorization failures', async () => {
    const fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { type: 'permission_error', message: 'Permission denied' },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const stream = await bind(fetch);
    const result = await (await stream(model, context)).result();
    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toContain('Permission denied');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        type: 'provider_response_failure',
        details: expect.objectContaining({ status: 403 }),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not send a cancelled invocation', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('must not request'));
    const stream = await bind(fetch);
    const controller = new AbortController();
    controller.abort();
    const result = await (await stream(model, context, { signal: controller.signal })).result();
    expect(result.stopReason).toBe('aborted');
    expect(fetch).not.toHaveBeenCalled();
  });
});
