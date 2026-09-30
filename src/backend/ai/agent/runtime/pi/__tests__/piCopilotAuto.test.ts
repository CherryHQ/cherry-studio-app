import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { ProviderAccountError } from '@/shared/contracts/providerAccounts';
import type { Provider } from '@/shared/data/types/provider';

import type { RuntimeExecutionRequest } from '../../types';
import { resolvePiCopilotAuto, toPiCopilotAutoInput } from '../piCopilotAuto';
import { listPiOAuthModels, resolveOAuthPiModel } from '../piOAuthModels';

const auth = { apiKey: 'copilot-access', baseUrl: 'https://api.individual.githubcopilot.com' };
const signal = new AbortController().signal;
const input = { prompt: 'Explain this code', hasImage: false };
const fetch = jest.fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>();

function response(selected: Record<string, unknown> = { id: 'claude-haiku-4.5' }) {
  return {
    session_token: 'auto-session-secret',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    selected_model: selected,
  };
}

function reply(body: unknown, status = 200) {
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => fetch.mockReset());

it('routes with Copilot OAuth and binds the session token to the real model', async () => {
  reply(response());
  const result = await resolvePiCopilotAuto(auth, input, fetch, signal);
  expect(fetch).toHaveBeenCalledWith(
    new URL('https://api.individual.githubcopilot.com/auto'),
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer copilot-access' }),
      body: JSON.stringify({ prompt: 'Explain this code' }),
    }),
  );
  expect(result.model).toMatchObject({
    id: 'claude-haiku-4.5',
    api: 'anthropic-messages',
    headers: { 'Copilot-Session-Token': 'auto-session-secret' },
  });
});

it('uses live token limits while reusing the known model protocol', async () => {
  reply(
    response({
      id: 'claude-haiku-4.5',
      supported_endpoints: ['/v1/messages'],
      capabilities: {
        type: 'chat',
        limits: {
          max_context_window_tokens: 128000,
          max_prompt_tokens: 100000,
          max_output_tokens: 16000,
        },
        supports: { vision: true, tool_calls: true },
      },
    }),
  );
  const result = await resolvePiCopilotAuto(auth, { ...input, hasImage: true }, fetch, signal);
  expect(result).toMatchObject({
    maxInputTokens: 100000,
    supportsTools: true,
    model: {
      id: 'claude-haiku-4.5',
      api: 'anthropic-messages',
      input: ['text', 'image'],
      contextWindow: 128000,
      maxTokens: 16000,
    },
  });
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({
    prompt: input.prompt,
    has_image: true,
  });
});

it('rejects a protocol the bundled model cannot serve instead of guessing a fallback', async () => {
  reply(response({ id: 'claude-haiku-4.5', supported_endpoints: ['/chat/completions'] }));
  await expect(resolvePiCopilotAuto(auth, input, fetch, signal)).rejects.toEqual(
    new ProviderAccountError('configuration'),
  );
});

it.each([
  { ...response(), session_token: '' },
  { ...response(), session_token: 'token\r\nInjected: value' },
  { ...response(), expires_at: 1 },
  response({ id: 'unknown-model' }),
  response({ id: '__proto__' }),
  response({ id: 'claude-haiku-4.5', supported_endpoints: ['/unsupported'] }),
])('rejects unusable Auto responses without exposing their contents: %#', async (body) => {
  reply(body);
  await expect(resolvePiCopilotAuto(auth, input, fetch, signal)).rejects.toEqual(
    new ProviderAccountError('configuration'),
  );
});

it('rejects a text-only selection for image input', async () => {
  reply(
    response({
      id: 'claude-haiku-4.5',
      capabilities: { type: 'chat', supports: { vision: false } },
    }),
  );
  await expect(
    resolvePiCopilotAuto(auth, { ...input, hasImage: true }, fetch, signal),
  ).rejects.toEqual(new ProviderAccountError('configuration'));
});

it.each([401, 403, 429, 500])('hides server error bodies for status %i', async (status) => {
  reply({ error: 'private copilot-access auto-session-secret' }, status);
  await expect(resolvePiCopilotAuto(auth, input, fetch, signal)).rejects.toEqual(
    new ProviderAccountError(status === 401 || status === 403 ? 'authorization' : 'request'),
  );
});

it('does not send credentials to an untrusted Auto endpoint', async () => {
  await expect(
    resolvePiCopilotAuto({ ...auth, baseUrl: 'https://untrusted.example' }, input, fetch, signal),
  ).rejects.toEqual(new ProviderAccountError('configuration'));
  expect(fetch).not.toHaveBeenCalled();
});

it('discards a late Auto result after cancellation', async () => {
  const controller = new AbortController();
  fetch.mockImplementationOnce(async () => {
    controller.abort();
    return new Response(JSON.stringify(response()));
  });
  await expect(resolvePiCopilotAuto(auth, input, fetch, controller.signal)).rejects.toEqual(
    new ProviderAccountError('cancelled'),
  );
});

it('offers Auto even when an account has no manually selectable models', async () => {
  const account = { id: 'github-copilot' as const, auth, availableModelIds: [] };
  const models = await listPiOAuthModels({} as Provider, account, signal);
  expect(models).toEqual([
    expect.objectContaining({
      modelId: 'auto',
      name: 'GitHub Copilot Auto',
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
    }),
  ]);
  expect(models[0].contextWindow).toBeUndefined();
  await expect(resolveOAuthPiModel(account, 'claude-haiku-4.5')).rejects.toEqual(
    new ProviderAccountError('configuration'),
  );
});

it('includes historical image requirements and provides a prompt for image-only input', () => {
  const request = {
    input: [{ type: 'text', text: 'What changed?' }],
    history: [{ messages: [{ parts: [{ type: 'file', mediaType: 'image/png' }] }] }],
  } as RuntimeExecutionRequest;
  expect(toPiCopilotAutoInput(request)).toEqual({ prompt: 'What changed?', hasImage: true });
  expect(toPiCopilotAutoInput({ ...request, input: [] }).prompt).not.toBe('');
});
