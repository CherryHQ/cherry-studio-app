import {
  ProviderConfigSchema,
  type ProviderConfig,
  type RegistryEndpointConfig,
} from '@cherrystudio/provider-registry';
import { bundledProviders } from '@cherrystudio/provider-registry/data/providers';

import type {
  ApiFeatures,
  ProviderAuthMethod,
  ProviderModelListSource,
} from '@/shared/data/types/provider';

export type MobileProviderConfig = Omit<ProviderConfig, 'endpointConfigs'> & {
  endpointConfigs?: Record<string, RegistryEndpointConfig>;
  apiFeatures?: ApiFeatures;
  authMethods?: ProviderAuthMethod[];
  authOptional?: boolean;
  modelListSource?: ProviderModelListSource;
};

// Mobile authentication, connection adapters, legacy flags, and native-tool corrections are not
// part of the published catalog.
const mobileProviderExtensions: Record<string, Partial<MobileProviderConfig>> = {
  cherryin: {
    authMethods: ['api-key', 'oauth'],
  },
  silicon: {
    authMethods: ['api-key', 'oauth'],
  },
  aihubmix: {
    authMethods: ['api-key', 'oauth'],
  },
  ovms: {
    authOptional: true,
  },
  deepseek: {
    apiFeatures: {
      arrayContent: false,
    },
    // DeepSeek's Responses contract ignores `web_search`; its Anthropic mirror serves it.
    serverTools: [
      { id: 'web-search', modelScope: 'model-dependent', endpointTypes: ['anthropic-messages'] },
    ],
  },
  aionly: {
    authMethods: ['api-key', 'oauth'],
    endpointConfigs: {
      'openai-chat-completions': {
        adapterFamily: 'openai-compatible',
      },
    },
  },
  '302ai': {
    authMethods: ['api-key', 'oauth'],
  },
  ppio: {
    authMethods: ['api-key', 'oauth'],
  },
  openrouter: {
    apiFeatures: {
      reportsActualCost: true,
    },
    authMethods: ['api-key', 'oauth'],
  },
  ollama: {
    authOptional: true,
  },
  requesty: {
    defaultChatEndpoint: 'openai-chat-completions',
    description: 'Requesty - AI model provider',
    endpointConfigs: {
      'openai-chat-completions': {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://router.requesty.ai/v1',
      },
    },
    id: 'requesty',
    metadata: {
      website: {
        apiKey: 'https://app.requesty.ai/api-keys',
        docs: 'https://docs.requesty.ai',
        models: 'https://www.requesty.ai/models',
        official: 'https://requesty.ai/',
      },
    },
    name: 'Requesty',
  },
  'new-api': {
    endpointConfigs: {
      'anthropic-messages': {
        baseUrl: 'http://localhost:3000',
      },
      'google-generate-content': {
        baseUrl: 'http://localhost:3000',
      },
      'openai-responses': {
        baseUrl: 'http://localhost:3000',
      },
    },
  },
  lmstudio: {
    authOptional: true,
  },
  'claude-code': {
    authMethods: ['external-cli'],
    modelListSource: 'registry',
  },
  'openai-codex': {
    apiFeatures: {
      serviceTier: true,
    },
    authMethods: ['oauth'],
    modelListSource: 'registry',
  },
  'grok-cli': {
    authMethods: ['oauth'],
    modelListSource: 'registry',
  },
  openai: {
    apiFeatures: {
      serviceTier: true,
    },
  },
  github: {
    defaultChatEndpoint: 'openai-chat-completions',
    description: 'Github Models - AI model provider',
    endpointConfigs: {
      'openai-chat-completions': {
        adapterFamily: 'openai-compatible',
        baseUrl: 'https://models.github.ai/inference',
      },
    },
    id: 'github',
    metadata: {
      website: {
        apiKey: 'https://github.com/settings/tokens',
        docs: 'https://docs.github.com/en/github-models',
        models: 'https://github.com/marketplace/models',
        official: 'https://github.com/marketplace/models',
      },
    },
    name: 'Github Models',
  },
  copilot: {
    authMethods: ['oauth'],
    endpointConfigs: {
      'anthropic-messages': {
        adapterFamily: 'anthropic',
        baseUrl: 'https://api.githubcopilot.com',
      },
      'openai-responses': {
        adapterFamily: 'openai',
        baseUrl: 'https://api.githubcopilot.com',
      },
    },
  },
  'kimi-coding': {
    authMethods: ['oauth'],
    defaultChatEndpoint: 'anthropic-messages',
    description: 'Kimi Code - AI model provider',
    endpointConfigs: {
      'anthropic-messages': {
        adapterFamily: 'anthropic',
        baseUrl: 'https://api.kimi.com/coding',
      },
    },
    id: 'kimi-coding',
    metadata: {
      website: {
        official: 'https://www.kimi.com/code',
      },
    },
    modelListSource: 'registry',
    name: 'Kimi Code',
  },
  baichuan: {
    apiFeatures: {
      arrayContent: false,
    },
  },
  minimax: {
    apiFeatures: {
      arrayContent: false,
    },
  },
  groq: {
    apiFeatures: {
      serviceTier: true,
    },
  },
  grok: {
    authMethods: ['api-key', 'oauth'],
  },
  meta: {
    authMethods: ['oauth'],
    defaultChatEndpoint: 'openai-responses',
    description: 'Meta - AI model provider',
    endpointConfigs: {
      'openai-responses': {
        adapterFamily: 'openai',
        baseUrl: 'https://api.meta.ai/v1',
      },
    },
    id: 'meta',
    metadata: {
      website: {
        official: 'https://www.meta.ai',
      },
    },
    modelListSource: 'registry',
    name: 'Meta',
  },
  mistral: {
    apiFeatures: {
      streamOptions: false,
    },
  },
  xirang: {
    apiFeatures: {
      arrayContent: false,
    },
  },
  tokenhub: {
    modelListSource: 'registry',
  },
  gpustack: {
    authOptional: true,
  },
  voyageai: {
    modelListSource: 'registry',
  },
  'aws-bedrock': {
    modelListSource: 'registry',
  },
  poe: {
    apiFeatures: {
      arrayContent: false,
    },
    // Poe documents web search for OpenAI bots on its Responses endpoint only.
    serverTools: [
      {
        id: 'web-search',
        modelScope: 'model-dependent',
        endpointTypes: ['openai-responses'],
        vendors: ['openai'],
      },
    ],
  },
  longcat: {
    modelListSource: 'registry',
  },
  huggingface: {
    endpointConfigs: {
      'openai-responses': {
        adapterFamily: 'huggingface',
      },
    },
  },
};

const providersById = new Map<string, MobileProviderConfig>(
  bundledProviders.providers.map((provider) => [provider.id, provider]),
);
for (const [id, extension] of Object.entries(mobileProviderExtensions)) {
  const provider = providersById.get(id);
  if (!provider) {
    providersById.set(id, {
      ...extension,
      ...ProviderConfigSchema.parse({ ...extension, id }),
    });
    continue;
  }
  const endpointConfigs: Record<string, RegistryEndpointConfig> = { ...provider.endpointConfigs };
  for (const [endpoint, config] of Object.entries(extension.endpointConfigs ?? {})) {
    endpointConfigs[endpoint] = { ...endpointConfigs[endpoint], ...config };
  }
  providersById.set(id, { ...provider, ...extension, endpointConfigs });
}

// Preserve Mobile's promoted provider order while the rest follows the published catalog.
const promotedIds = ['cherryin', 'radeon-cloud'];
const providers = [
  ...promotedIds.flatMap((id) => {
    const provider = providersById.get(id);
    return provider ? [provider] : [];
  }),
  ...[...providersById.values()].filter((provider) => !promotedIds.includes(provider.id)),
];

export const mobileProviders = { version: bundledProviders.version, providers };

export function findMobileProvider(providerId: string): MobileProviderConfig | null {
  return providersById.get(providerId) ?? null;
}
