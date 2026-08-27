import * as z from 'zod';

import type { Currency, EndpointType } from './model';

export const PROVIDER_TYPES = [
  'openai',
  'openai-response',
  'anthropic',
  'gemini',
  'azure-openai',
  'vertexai',
  'mistral',
  'aws-bedrock',
  'vertex-anthropic',
  'new-api',
  'aihubmix',
  'cerebras',
  'gateway',
  'groq',
  'huggingface',
  'perplexity',
  'together',
  'ollama',
] as const;

export const ProviderTypeSchema = z.enum(PROVIDER_TYPES);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

const PROVIDER_TYPE_ENDPOINTS = {
  ANTHROPIC_MESSAGES: 'anthropic-messages',
  GOOGLE_GENERATE_CONTENT: 'google-generate-content',
  OLLAMA_CHAT: 'ollama-chat',
  OLLAMA_GENERATE: 'ollama-generate',
  OPENAI_CHAT_COMPLETIONS: 'openai-chat-completions',
  OPENAI_RESPONSES: 'openai-responses',
  OPENAI_TEXT_COMPLETIONS: 'openai-text-completions',
} as const satisfies Record<string, EndpointType>;

export type OpenAIServiceTier = 'auto' | 'default' | 'flex' | 'priority' | null | undefined;
export type GroqServiceTier = 'auto' | 'on_demand' | 'flex' | null | undefined;
export type ServiceTier = GroqServiceTier | OpenAIServiceTier;

export type ApiKeyEntry = {
  id: string;
  isEnabled: boolean;
  key: string;
  label?: string;
};

export type RuntimeApiKey = Omit<ApiKeyEntry, 'key'>;

export type AuthType = 'api-key' | 'iam-aws' | 'api-key-aws' | 'iam-gcp' | 'iam-azure';

export type AuthConfig =
  | {
      headerName?: string;
      prefix?: string;
      required?: boolean;
      type: 'api-key';
    }
  | {
      accessKeyId?: string;
      region: string;
      secretAccessKey?: string;
      type: 'iam-aws';
    }
  | {
      region: string;
      type: 'api-key-aws';
    }
  | {
      credentials?: Record<string, unknown>;
      location: string;
      project: string;
      type: 'iam-gcp';
    }
  | {
      apiVersion: string;
      deploymentId?: string;
      type: 'iam-azure';
    };

export type ApiFeatures = {
  arrayContent?: boolean;
  serviceTier?: boolean;
  streamOptions?: boolean;
  verbosity?: boolean;
  reportsActualCost?: boolean;
};

export type RuntimeApiFeatures = Required<ApiFeatures>;

export const DEFAULT_API_FEATURES: RuntimeApiFeatures = {
  arrayContent: true,
  serviceTier: false,
  streamOptions: true,
  verbosity: false,
  reportsActualCost: false,
};

export type ProviderSettings = {
  apiVersion?: string;
  cacheControl?: {
    cacheLastNMessages?: number;
    cacheSystemMessage?: boolean;
    enabled: boolean;
    tokenThreshold?: number;
  };
  extraHeaders?: Record<string, string>;
  isAuthed?: boolean;
  keepAliveTime?: number;
  notes?: string;
  rateLimit?: number;
  serviceTier?: string | null;
  streamOptions?: {
    includeUsage?: boolean;
  };
  summaryText?: 'auto' | 'concise' | 'detailed' | null;
  timeout?: number;
  verbosity?: string | null;
};

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {};

export type ModelsApiUrls = {
  default?: string;
  embedding?: string;
  image?: string;
  reranker?: string;
};

export type EndpointConfig = {
  adapterFamily?: string;
  baseUrl?: string;
  modelsApiUrls?: ModelsApiUrls;
  reasoningFormatType?: string;
};

export const EndpointConfigOverrideSchema = z.object({
  baseUrl: z.string().optional(),
});
export type EndpointConfigOverride = z.infer<typeof EndpointConfigOverrideSchema>;

export type EndpointConfigs = Partial<Record<EndpointType, EndpointConfig>>;

export type ProviderWebsites = {
  apiKey?: string;
  docs?: string;
  models?: string;
  official?: string;
};

export type ProviderModelListSource = 'api' | 'registry';

/**
 * The registry's capability catalogue — what a provider *is* upstream, not what
 * mobile implements. `oauth` and `external-cli` stay in the union even though
 * mobile has neither flow: presets carry them, and the runtime reads
 * `external-cli` to route work away from providers it cannot execute.
 */
export type ProviderAuthMethod = 'api-key' | 'oauth' | 'external-cli';

export type Provider = {
  apiFeatures: RuntimeApiFeatures;
  apiKeys: RuntimeApiKey[];
  authMethods?: ProviderAuthMethod[];
  authOptional?: boolean;
  authType: AuthType;
  defaultChatEndpoint?: EndpointType;
  description?: string;
  endpointConfigs?: EndpointConfigs;
  fastMode?: { transport: 'openai-priority' };
  id: string;
  isEnabled: boolean;
  modelListSource?: ProviderModelListSource;
  name: string;
  presetProviderId?: string;
  reportedCostCurrency?: Currency;
  settings: ProviderSettings;
  websites?: ProviderWebsites;
};

type ProviderTypeSource = Pick<
  Provider,
  'authType' | 'defaultChatEndpoint' | 'id' | 'presetProviderId'
>;

function matchesPreset(provider: ProviderTypeSource, presetId: string): boolean {
  return provider.id === presetId || provider.presetProviderId === presetId;
}

export function resolveProviderType(provider: ProviderTypeSource): ProviderType {
  if (provider.authType === 'iam-azure') {
    return 'azure-openai';
  }

  if (provider.authType === 'iam-gcp') {
    return 'vertexai';
  }

  if (provider.authType === 'iam-aws' || provider.authType === 'api-key-aws') {
    return 'aws-bedrock';
  }

  if (matchesPreset(provider, 'new-api')) {
    return 'new-api';
  }

  if (matchesPreset(provider, 'aihubmix')) {
    return 'aihubmix';
  }

  if (matchesPreset(provider, 'cerebras')) {
    return 'cerebras';
  }

  if (provider.id === 'gateway') {
    return 'gateway';
  }

  if (matchesPreset(provider, 'groq')) {
    return 'groq';
  }

  if (matchesPreset(provider, 'huggingface')) {
    return 'huggingface';
  }

  if (matchesPreset(provider, 'mistral')) {
    return 'mistral';
  }

  if (matchesPreset(provider, 'perplexity')) {
    return 'perplexity';
  }

  if (matchesPreset(provider, 'together')) {
    return 'together';
  }

  switch (provider.defaultChatEndpoint ?? PROVIDER_TYPE_ENDPOINTS.OPENAI_CHAT_COMPLETIONS) {
    case PROVIDER_TYPE_ENDPOINTS.OPENAI_RESPONSES:
      return 'openai-response';
    case PROVIDER_TYPE_ENDPOINTS.ANTHROPIC_MESSAGES:
      return 'anthropic';
    case PROVIDER_TYPE_ENDPOINTS.GOOGLE_GENERATE_CONTENT:
      return 'gemini';
    case PROVIDER_TYPE_ENDPOINTS.OLLAMA_CHAT:
    case PROVIDER_TYPE_ENDPOINTS.OLLAMA_GENERATE:
      return 'ollama';
    default:
      return 'openai';
  }
}
