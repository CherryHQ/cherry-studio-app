import {
  type ConfigureBuiltinProviderInput,
  type CreateCustomProviderInput,
  type ProviderConfigurationManualModel,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import {
  createUniqueModelId,
  ENDPOINT_TYPE,
  type Model,
} from '@cherrystudio/universal/data/types/model';
import {
  type ApiKeyEntry,
  type AuthConfig,
  canEditProviderEndpoint,
  DEFAULT_API_FEATURES,
  DEFAULT_PROVIDER_SETTINGS,
  type EndpointConfigs,
  isValidProviderEndpointUrl,
  type Provider,
} from '@cherrystudio/universal/data/types/provider';
import * as Crypto from 'expo-crypto';

export type ProviderSetupDraft = ConfigureBuiltinProviderInput | CreateCustomProviderInput;

export type PreparedProviderSetup = {
  apiKey: string;
  authConfig?: AuthConfig;
  endpointConfigs: EndpointConfigs | undefined;
  provider: Provider;
};

export function prepareBuiltinProviderSetup(
  provider: Provider,
  input: ConfigureBuiltinProviderInput,
): PreparedProviderSetup {
  const baseUrl = input.baseUrl.trim();
  if (!baseUrl) return { apiKey: input.apiKey.trim(), endpointConfigs: undefined, provider };
  if (!canEditProviderEndpoint(provider)) {
    throw new Error(`${provider.name} does not allow a Base URL override.`);
  }
  if (!isValidProviderEndpointUrl(baseUrl)) {
    throw new Error('Base URL must be an absolute HTTP URL.');
  }

  const endpoint = provider.defaultChatEndpoint ?? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
  const endpointConfigs = {
    ...provider.endpointConfigs,
    [endpoint]: { ...provider.endpointConfigs?.[endpoint], baseUrl },
  };
  return {
    apiKey: input.apiKey.trim(),
    endpointConfigs,
    provider: { ...provider, endpointConfigs },
  };
}

export function prepareCustomProviderSetup(
  input: CreateCustomProviderInput,
  existing: Provider | undefined,
): PreparedProviderSetup {
  const providerId = input.providerId.trim();
  if (!providerId) throw new Error('A stable provider id is required before review.');
  const name = input.name.trim();
  if (!name) throw new Error('Provider name is required.');
  if (existing?.presetProviderId != null) {
    throw new Error('The generated provider id belongs to a built-in provider.');
  }
  if (existing && normalizeProviderName(existing.name) !== normalizeProviderName(name)) {
    throw new Error('The generated provider id is already used by another custom provider.');
  }

  const endpointConfigs = createCustomEndpointConfigs(input);
  if (!endpointConfigs[input.defaultChatEndpoint]?.baseUrl) {
    throw new Error('The selected default chat endpoint must have a URL.');
  }

  return {
    apiKey: input.apiKey.trim(),
    authConfig: { type: 'api-key' },
    endpointConfigs,
    provider: {
      apiFeatures: existing?.apiFeatures ?? DEFAULT_API_FEATURES,
      apiKeys: existing?.apiKeys ?? [],
      authMethods: existing?.authMethods,
      authOptional: existing?.authOptional,
      authType: 'api-key',
      defaultChatEndpoint: input.defaultChatEndpoint,
      endpointConfigs,
      id: providerId,
      isEnabled: existing?.isEnabled ?? false,
      name,
      settings: existing?.settings ?? DEFAULT_PROVIDER_SETTINGS,
    },
  };
}

function createCustomEndpointConfigs(input: CreateCustomProviderInput): EndpointConfigs {
  const values: Partial<Record<keyof CreateCustomProviderInput, string>> = {
    anthropicUrl: input.anthropicUrl,
    baseUrl: input.baseUrl,
    geminiUrl: input.geminiUrl,
    imageEditUrl: input.imageEditUrl,
    imageGenerationUrl: input.imageGenerationUrl,
    openaiResponsesUrl: input.openaiResponsesUrl,
  };
  for (const [field, value] of Object.entries(values)) {
    if (value.trim() && !isValidProviderEndpointUrl(value)) {
      throw new Error(`${field} must be an absolute HTTP URL.`);
    }
  }
  if (!input.baseUrl.trim()) throw new Error('Base URL is required.');

  return Object.fromEntries(
    [
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, input.baseUrl],
      [ENDPOINT_TYPE.OPENAI_RESPONSES, input.openaiResponsesUrl],
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES, input.anthropicUrl],
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, input.geminiUrl],
      [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, input.imageGenerationUrl],
      [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT, input.imageEditUrl],
    ].flatMap(([endpoint, value]) => (value.trim() ? [[endpoint, { baseUrl: value.trim() }]] : [])),
  ) as EndpointConfigs;
}

export function materializeManualModels(
  drafts: readonly ProviderConfigurationManualModel[],
  providerId: string,
): Model[] {
  return drafts.map((draft) => ({
    capabilities: [],
    contextWindow: draft.contextWindow || undefined,
    endpointTypes: draft.endpointTypes.length ? draft.endpointTypes : undefined,
    group: draft.group.trim() || undefined,
    id: createUniqueModelId(providerId, draft.modelId.trim()),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    maxInputTokens: draft.maxInputTokens || undefined,
    maxOutputTokens: draft.maxOutputTokens || undefined,
    modelId: draft.modelId.trim(),
    name: draft.name.trim() || draft.modelId.trim(),
    providerId,
    supportsStreaming: true,
  }));
}

export function dedupeProviderSetupModels(models: readonly Model[]): Model[] {
  return [...new Map(models.map((model) => [model.id, model])).values()];
}

export function appendProviderApiKey(keys: readonly ApiKeyEntry[], apiKey: string): ApiKeyEntry[] {
  const trimmed = apiKey.trim();
  if (!trimmed || keys.some((entry) => entry.key.trim() === trimmed)) return [...keys];
  return [...keys, { id: Crypto.randomUUID(), isEnabled: true, key: trimmed }];
}

export function assertCustomProviderNameAvailable(
  providers: readonly { id: string; name: string }[],
  name: string,
  providerId: string,
): void {
  const normalized = normalizeProviderName(name);
  const conflict = providers.find(
    (provider) => provider.id !== providerId && normalizeProviderName(provider.name) === normalized,
  );
  if (conflict) throw new Error(`A provider named "${conflict.name}" already exists.`);
}

export function normalizeProviderLookup(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[\s_-]+/g, '');
}

export function normalizeProviderName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replaceAll(/\s+/g, ' ');
}

export function getProviderOrigin(provider: Provider): string {
  const endpoint = provider.defaultChatEndpoint ?? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
  const baseUrl = provider.endpointConfigs?.[endpoint]?.baseUrl?.trim();
  if (!baseUrl) return '';
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}
