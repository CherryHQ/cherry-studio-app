import { listModels } from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { Model as PiModel } from '@earendil-works/pi-ai';

import { ProviderAccountError } from '@/shared/contracts/providerAccounts';
import type { PiOAuthProviderId } from '@/shared/data/providerOAuth';
import type { Model, ReasoningEffort } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import type { SupportedPiApi } from './piApiAdapters';
import type { PiProviderAccountAdapter } from './PiProviderAccountAdapter';

export type ResolvedPiOAuth = NonNullable<
  Awaited<ReturnType<PiProviderAccountAdapter['resolveAuth']>>
>;

/** Selective official catalogs preserve per-model API, compatibility headers, and thinking metadata. */
async function catalog(id: PiOAuthProviderId): Promise<Record<string, PiModel<SupportedPiApi>>> {
  switch (id) {
    case 'github-copilot':
      return (await import('@earendil-works/pi-ai/providers/github-copilot.models'))
        .GITHUB_COPILOT_MODELS;
    case 'openai-codex':
      return (await import('@earendil-works/pi-ai/providers/openai-codex.models'))
        .OPENAI_CODEX_MODELS;
    case 'kimi-coding':
      return (await import('@earendil-works/pi-ai/providers/kimi-coding.models'))
        .KIMI_CODING_MODELS;
    case 'xai':
      return (await import('@earendil-works/pi-ai/providers/xai.models')).XAI_MODELS;
    case 'openrouter':
      return {};
  }
}

export async function resolveOAuthPiModel(auth: ResolvedPiOAuth, modelId: string) {
  if (auth.id === 'openrouter') return undefined;
  const model = (await catalog(auth.id))[modelId];
  if (!model || (auth.availableModelIds && !auth.availableModelIds.includes(modelId))) {
    throw new ProviderAccountError('configuration');
  }
  return model;
}

export async function listPiOAuthModels(
  provider: Provider,
  auth: ResolvedPiOAuth,
  signal: AbortSignal,
): Promise<Partial<Model>[]> {
  if (auth.id === 'openrouter') {
    // OpenRouter OAuth mints an ordinary API key. Keep discovery on the existing provider path.
    requireOAuthEndpoint(provider, 'openrouter');
    return listModels(
      provider,
      {
        getRotatedApiKey: () => auth.auth.apiKey ?? '',
        getAuthConfig: async () => undefined,
        getVertexAuthHeaders: async () => {
          throw new ProviderAccountError('unsupported');
        },
      },
      signal,
      { throwOnError: true },
    );
  }
  const models = Object.values(await catalog(auth.id));
  signal.throwIfAborted();
  return models
    .filter((model) => !auth.availableModelIds || auth.availableModelIds.includes(model.id))
    .map((model) => ({
      modelId: model.id,
      apiModelId: model.id,
      name: model.name,
      capabilities: [
        MODEL_CAPABILITY.FUNCTION_CALL,
        ...(model.input.includes('image') ? [MODEL_CAPABILITY.IMAGE_RECOGNITION] : []),
        ...(model.reasoning ? [MODEL_CAPABILITY.REASONING] : []),
      ],
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens,
      inputModalities: model.input,
      outputModalities: ['text'],
      endpointTypes: [endpointForPiApi(model.api)],
      supportsStreaming: true,
      isEnabled: true,
      presetModelId: model.id,
      reasoning: model.reasoning ? modelReasoning(model) : undefined,
    }));
}

function modelReasoning(model: PiModel<SupportedPiApi>): NonNullable<Model['reasoning']> {
  const levels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
  const efforts: ReasoningEffort[] = levels.filter(
    (level) =>
      model.thinkingLevelMap?.[level] !== null &&
      (level === 'xhigh' || level === 'max' ? model.thinkingLevelMap?.[level] !== undefined : true),
  );
  if (!model.thinkingLevelMap || model.thinkingLevelMap.off !== null) efforts.unshift('none');
  return {
    selectableEfforts: efforts,
    supportedEfforts: efforts,
    defaultEffort: efforts.includes('medium')
      ? 'medium'
      : efforts.includes('high')
        ? 'high'
        : efforts[0],
  };
}

export function endpointForPiApi(api: SupportedPiApi) {
  switch (api) {
    case 'anthropic-messages':
      return ENDPOINT_TYPE.ANTHROPIC_MESSAGES;
    case 'openai-completions':
      return ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
    case 'google-generative-ai':
      return ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT;
    default:
      return ENDPOINT_TYPE.OPENAI_RESPONSES;
  }
}

/** OAuth credentials always use the official destination, never a user-edited inference host. */
export function requireOAuthEndpoint(provider: Provider, id: PiOAuthProviderId, baseUrl?: string) {
  const hosts: Record<PiOAuthProviderId, readonly string[]> = {
    'github-copilot': ['api.githubcopilot.com', 'api.individual.githubcopilot.com'],
    'openai-codex': ['chatgpt.com'],
    'kimi-coding': ['api.kimi.com'],
    xai: ['api.x.ai'],
    openrouter: ['openrouter.ai'],
  };
  const urls = baseUrl
    ? [baseUrl]
    : Object.values(provider.endpointConfigs ?? {}).map((value) => value?.baseUrl ?? '');
  if (!urls.length) throw new ProviderAccountError('configuration');
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        hosts[id].includes(url.hostname)
      )
        continue;
    } catch {
      /* Malformed or untrusted endpoints cannot receive account credentials. */
    }
    throw new ProviderAccountError('configuration');
  }
}
