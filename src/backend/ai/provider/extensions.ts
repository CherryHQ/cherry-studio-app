/** App-specific Provider Extensions registered alongside `coreExtensions`. */

import {
  type AmazonBedrockProvider,
  type AmazonBedrockProviderSettings,
  createAmazonBedrock,
} from '@ai-sdk/amazon-bedrock';
import { type CerebrasProviderSettings, createCerebras } from '@ai-sdk/cerebras';
import { createGateway, type GatewayProviderSettings } from '@ai-sdk/gateway';
import {
  createVertexAnthropic,
  type GoogleVertexAnthropicProvider,
} from '@ai-sdk/google-vertex/anthropic/edge';
import {
  createVertex,
  type GoogleVertexProvider,
  type GoogleVertexProviderSettings,
} from '@ai-sdk/google-vertex/edge';
import {
  createVertexMaas,
  type GoogleVertexMaasProvider,
  type GoogleVertexMaasProviderSettings,
} from '@ai-sdk/google-vertex/maas/edge';
import { createGroq, type GroqProviderSettings } from '@ai-sdk/groq';
import { createHuggingFace, type HuggingFaceProviderSettings } from '@ai-sdk/huggingface';
import { createMistral, type MistralProviderSettings } from '@ai-sdk/mistral';
import { createPerplexity, type PerplexityProviderSettings } from '@ai-sdk/perplexity';
import type { ProviderV3 } from '@ai-sdk/provider';
import { createTogetherAI, type TogetherAIProviderSettings } from '@ai-sdk/togetherai';
import { ProviderExtension, type ProviderExtensionConfig } from '@cherrystudio/ai-core/provider';
import { createOllama, type OllamaProviderSettings } from 'ollama-ai-provider-v2';

import { type AihubmixProviderSettings, createAihubmix } from './custom/aihubmix/aihubmixProvider';
import { createDmxapiProvider, type DmxapiProviderSettings } from './custom/dmxapi/dmxapiProvider';
import { createNewApi, type NewApiProviderSettings } from './custom/newapiProvider';

export const GoogleVertexExtension = ProviderExtension.create({
  name: 'google-vertex',
  aliases: ['vertexai'] as const,
  supportsImageGeneration: true,
  create: createVertex,
  toolFactories: {
    webSearch:
      (provider: GoogleVertexProvider) =>
      (config: NonNullable<Parameters<GoogleVertexProvider['tools']['googleSearch']>[0]>) => ({
        tools: { webSearch: provider.tools.googleSearch(config) },
      }),
    urlContext:
      (provider: GoogleVertexProvider) =>
      (config: NonNullable<Parameters<GoogleVertexProvider['tools']['urlContext']>[0]>) => ({
        tools: { urlContext: provider.tools.urlContext(config) },
      }),
  },
} as const satisfies ProviderExtensionConfig<
  GoogleVertexProviderSettings,
  GoogleVertexProvider,
  'google-vertex'
>);

export const GoogleVertexAnthropicExtension = ProviderExtension.create({
  name: 'google-vertex-anthropic',
  aliases: ['vertexai-anthropic'] as const,
  supportsImageGeneration: true,
  create: createVertexAnthropic,
  toolFactories: {
    webSearch:
      (provider: GoogleVertexAnthropicProvider) =>
      (
        config: NonNullable<
          Parameters<GoogleVertexAnthropicProvider['tools']['webSearch_20250305']>[0]
        >,
      ) => ({ tools: { webSearch: provider.tools.webSearch_20250305(config) } }),
  },
} as const satisfies ProviderExtensionConfig<
  GoogleVertexProviderSettings,
  GoogleVertexAnthropicProvider,
  'google-vertex-anthropic'
>);

export const GoogleVertexMaaSExtension = ProviderExtension.create({
  name: 'google-vertex-maas',
  aliases: ['vertexai-maas'] as const,
  supportsImageGeneration: false,
  create: createVertexMaas,
} as const satisfies ProviderExtensionConfig<
  GoogleVertexMaasProviderSettings,
  GoogleVertexMaasProvider,
  'google-vertex-maas'
>);

export const BedrockExtension = ProviderExtension.create({
  name: 'bedrock',
  aliases: ['aws-bedrock'] as const,
  supportsImageGeneration: true,
  create: createAmazonBedrock,
  toolFactories: {
    webSearch:
      (provider: AmazonBedrockProvider) =>
      (
        config: NonNullable<Parameters<AmazonBedrockProvider['tools']['webSearch_20260209']>[0]>,
      ) => ({ tools: { webSearch: provider.tools.webSearch_20260209(config) } }),
    urlContext:
      (provider: AmazonBedrockProvider) =>
      (
        config: NonNullable<Parameters<AmazonBedrockProvider['tools']['webFetch_20260209']>[0]>,
      ) => ({ tools: { urlContext: provider.tools.webFetch_20260209(config) } }),
  },
} as const satisfies ProviderExtensionConfig<
  AmazonBedrockProviderSettings,
  AmazonBedrockProvider,
  'bedrock'
>);

export const OllamaExtension = ProviderExtension.create({
  // The dependency patch accepts the registry's closed `low | medium | high` targets.
  name: 'ollama',
  // MOBILE SYNC DIVERGENCE: desktop wraps Ollama with an image-model adapter that mobile has not
  // ported; native chat/reasoning remains available through the upstream provider.
  supportsImageGeneration: false,
  create: createOllama,
} as const satisfies ProviderExtensionConfig<OllamaProviderSettings, ProviderV3, 'ollama'>);

export const PerplexityExtension = ProviderExtension.create({
  name: 'perplexity',
  supportsImageGeneration: false,
  create: createPerplexity,
} as const satisfies ProviderExtensionConfig<PerplexityProviderSettings, ProviderV3, 'perplexity'>);

export const MistralExtension = ProviderExtension.create({
  name: 'mistral',
  supportsImageGeneration: false,
  create: createMistral,
} as const satisfies ProviderExtensionConfig<MistralProviderSettings, ProviderV3, 'mistral'>);

export const HuggingFaceExtension = ProviderExtension.create({
  name: 'huggingface',
  aliases: ['hf', 'hugging-face'] as const,
  supportsImageGeneration: true,
  create: createHuggingFace,
} as const satisfies ProviderExtensionConfig<
  HuggingFaceProviderSettings,
  ProviderV3,
  'huggingface'
>);

export const GatewayExtension = ProviderExtension.create({
  name: 'gateway',
  aliases: ['ai-gateway'] as const,
  supportsImageGeneration: true,
  create: createGateway,
} as const satisfies ProviderExtensionConfig<GatewayProviderSettings, ProviderV3, 'gateway'>);

export const CerebrasExtension = ProviderExtension.create({
  name: 'cerebras',
  supportsImageGeneration: false,
  create: createCerebras,
} as const satisfies ProviderExtensionConfig<CerebrasProviderSettings, ProviderV3, 'cerebras'>);

export const GroqExtension = ProviderExtension.create({
  name: 'groq',
  supportsImageGeneration: false,
  create: createGroq,
} as const satisfies ProviderExtensionConfig<GroqProviderSettings, ProviderV3, 'groq'>);

export const AiHubMixExtension = ProviderExtension.create({
  name: 'aihubmix',
  supportsImageGeneration: true,
  create: createAihubmix,
} as const satisfies ProviderExtensionConfig<AihubmixProviderSettings, ProviderV3, 'aihubmix'>);

export const NewApiExtension = ProviderExtension.create({
  name: 'newapi',
  aliases: ['new-api'] as const,
  supportsImageGeneration: true,
  create: createNewApi,
} as const satisfies ProviderExtensionConfig<NewApiProviderSettings, ProviderV3, 'newapi'>);

export const DmxapiExtension = ProviderExtension.create({
  name: 'dmxapi',
  supportsImageGeneration: false,
  create: createDmxapiProvider,
} as const satisfies ProviderExtensionConfig<DmxapiProviderSettings, ProviderV3, 'dmxapi'>);

export const TogetherAIExtension = ProviderExtension.create({
  name: 'togetherai',
  aliases: ['together'] as const,
  supportsImageGeneration: true,
  create: createTogetherAI,
} as const satisfies ProviderExtensionConfig<TogetherAIProviderSettings, ProviderV3, 'togetherai'>);

export const extensions = [
  GoogleVertexExtension,
  GoogleVertexAnthropicExtension,
  GoogleVertexMaaSExtension,
  BedrockExtension,
  OllamaExtension,
  PerplexityExtension,
  MistralExtension,
  HuggingFaceExtension,
  GatewayExtension,
  CerebrasExtension,
  AiHubMixExtension,
  NewApiExtension,
  DmxapiExtension,
  TogetherAIExtension,
  GroqExtension,
] as const;
