/** App-specific Provider Extensions registered alongside `coreExtensions`. */

import { type CerebrasProviderSettings, createCerebras } from '@ai-sdk/cerebras';
import { createGateway, type GatewayProviderSettings } from '@ai-sdk/gateway';
import { createGroq, type GroqProviderSettings } from '@ai-sdk/groq';
import { createHuggingFace, type HuggingFaceProviderSettings } from '@ai-sdk/huggingface';
import { createMistral, type MistralProviderSettings } from '@ai-sdk/mistral';
import { createPerplexity, type PerplexityProviderSettings } from '@ai-sdk/perplexity';
import type { ProviderV3 } from '@ai-sdk/provider';
import { createTogetherAI, type TogetherAIProviderSettings } from '@ai-sdk/togetherai';
import { ProviderExtension, type ProviderExtensionConfig } from '@cherrystudio/ai-core/provider';

import { type AihubmixProviderSettings, createAihubmix } from '../custom/aihubmixProvider';
import { createNewApi, type NewApiProviderSettings } from '../custom/newapiProvider';

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

export const TogetherAIExtension = ProviderExtension.create({
  name: 'togetherai',
  aliases: ['together'] as const,
  supportsImageGeneration: true,
  create: createTogetherAI,
} as const satisfies ProviderExtensionConfig<TogetherAIProviderSettings, ProviderV3, 'togetherai'>);

export const extensions = [
  PerplexityExtension,
  MistralExtension,
  HuggingFaceExtension,
  GatewayExtension,
  CerebrasExtension,
  AiHubMixExtension,
  NewApiExtension,
  TogetherAIExtension,
  GroqExtension,
] as const;
