import type { Model as PiModel } from '@earendil-works/pi-ai';
import { z } from 'zod';

import { ProviderAccountError } from '@/shared/contracts/providerAccounts';

import type { RuntimeExecutionRequest } from '../types';
import type { SupportedPiApi } from './piApiAdapters';

export const COPILOT_AUTO_MODEL_ID = 'auto';

export type PiCopilotAutoInput = { prompt: string; hasImage: boolean };
export type PiCopilotAutoModel = {
  expiresAt: number;
  model: PiModel<SupportedPiApi>;
  maxInputTokens?: number;
  supportsTools: boolean;
};

const tokenLimit = z.number().int().positive().max(10_000_000);
const autoResponse = z.object({
  session_token: z
    .string()
    .min(1)
    .max(16_384)
    .regex(/^[!-~]+$/),
  expires_at: z.number().finite().positive(),
  selected_model: z.object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/),
    supported_endpoints: z.array(z.string()).optional(),
    capabilities: z
      .object({
        limits: z
          .object({
            max_context_window_tokens: tokenLimit.optional(),
            max_prompt_tokens: tokenLimit.optional(),
            max_output_tokens: tokenLimit.optional(),
          })
          .optional(),
        supports: z
          .object({
            vision: z.boolean().optional(),
            tool_calls: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
});

/** Routing needs the current question and vision requirements, before model-specific projection. */
export function toPiCopilotAutoInput(
  request: Pick<RuntimeExecutionRequest, 'input' | 'history'>,
): PiCopilotAutoInput {
  const parts = [
    ...request.input,
    ...request.history.flatMap((turn) => turn.messages.flatMap((message) => message.parts)),
  ];
  return {
    prompt:
      request.input
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim() || 'Describe the attached content.',
    hasImage: parts.some(
      (part) =>
        (part.type === 'file' && part.mediaType.startsWith('image/')) ||
        (part.type === 'document-attachment' && part.images.length > 0),
    ),
  };
}

/** Copilot Auto v2: server-selected model plus a billing token, never a literal model=auto call. */
export async function resolvePiCopilotAuto(
  auth: { apiKey?: string; baseUrl?: string },
  input: PiCopilotAutoInput,
  fetch: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<PiCopilotAutoModel> {
  const hosts = [
    'api.githubcopilot.com',
    'api.individual.githubcopilot.com',
    'api.business.githubcopilot.com',
    'api.enterprise.githubcopilot.com',
  ];
  let url: URL;
  try {
    url = new URL(auth.baseUrl ?? 'https://api.individual.githubcopilot.com');
    if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.host)) {
      throw new Error();
    }
  } catch {
    throw new ProviderAccountError('configuration');
  }
  if (!auth.apiKey) throw new ProviderAccountError('authorization');
  const models: Record<string, PiModel<SupportedPiApi>> = (
    await import('@earendil-works/pi-ai/providers/github-copilot.models')
  ).GITHUB_COPILOT_MODELS;
  signal.throwIfAborted();
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
  try {
    const response = await fetch(new URL('/auto', url), {
      method: 'POST',
      headers: {
        ...Object.values(models)[0]?.headers,
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        ...(input.hasImage ? { has_image: true } : {}),
      }),
      signal: requestSignal,
    });
    requestSignal.throwIfAborted();
    if (!response.ok) {
      throw new ProviderAccountError(
        response.status === 401 || response.status === 403 ? 'authorization' : 'request',
      );
    }
    const parsed = autoResponse.safeParse(await response.json().catch(() => undefined));
    requestSignal.throwIfAborted();
    if (!parsed.success || parsed.data.expires_at * 1000 <= Date.now()) {
      throw new ProviderAccountError('configuration');
    }

    const selected = parsed.data.selected_model;
    const known = Object.hasOwn(models, selected.id) ? models[selected.id] : undefined;
    const paths: Partial<Record<SupportedPiApi, string>> = {
      'openai-completions': '/chat/completions',
      'openai-responses': '/responses',
      'anthropic-messages': '/v1/messages',
    };
    if (
      !known ||
      (selected.supported_endpoints &&
        !selected.supported_endpoints.includes(paths[known.api] ?? ''))
    ) {
      throw new ProviderAccountError('configuration');
    }
    const limits = selected.capabilities?.limits;
    const supports = selected.capabilities?.supports;
    const vision = supports?.vision ?? known.input.includes('image');
    if (input.hasImage && !vision) {
      throw new ProviderAccountError('configuration');
    }
    return {
      expiresAt: parsed.data.expires_at * 1000,
      maxInputTokens: limits?.max_prompt_tokens,
      supportsTools: supports?.tool_calls ?? true,
      model: {
        ...known,
        baseUrl: url.origin,
        contextWindow:
          limits?.max_context_window_tokens ?? limits?.max_prompt_tokens ?? known.contextWindow,
        maxTokens: limits?.max_output_tokens ?? known.maxTokens,
        input: vision ? ['text', 'image'] : ['text'],
        headers: {
          ...known.headers,
          'Copilot-Session-Token': parsed.data.session_token,
        },
      },
    };
  } catch (error) {
    if (requestSignal.aborted) {
      throw new ProviderAccountError(signal.aborted ? 'cancelled' : 'network');
    }
    throw error;
  }
}
