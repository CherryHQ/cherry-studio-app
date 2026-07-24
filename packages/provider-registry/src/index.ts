/**
 * Cherry Studio Registry
 * Main entry point for the model and provider registry system
 */

// Shared vendor identity regex — consumed by @shared capability inference
// and @cherrystudio/ui icon routing. Single source of truth for "which
// vendor does this raw model ID belong to".
export type { VendorKey } from './patterns/vendor-patterns';
export { isVendor, matchVendor, VENDOR_PATTERNS } from './patterns/vendor-patterns';
// Pure lookup and transformation utilities (no fs dependency)
export type { ModelLookupResult, RuntimeEndpointConfig } from './registry-utils';
export {
  buildRuntimeEndpointConfigs,
  inferAdapterFamily,
  lookupRegistryModel,
  lookupRegistryProvider,
} from './registry-utils';
// Enum types (PascalCase, derived from const objects)
export type {
  AnthropicReasoningEffort,
  CanonicalParamKey,
  Currency,
  EndpointType,
  GeminiThinkingLevel,
  Modality,
  ModelCapability,
  OpenAIReasoningEffort,
  ReasoningEffort,
} from './schemas/enums';
// Enums — const objects (SCREAMING_CASE)
export {
  ANTHROPIC_REASONING_EFFORT,
  CANONICAL_PARAM_KEY,
  CURRENCY,
  ENDPOINT_TYPE,
  GEMINI_THINKING_LEVEL,
  MODALITY,
  MODEL_CAPABILITY,
  OPENAI_REASONING_EFFORT,
  objectValues,
  REASONING_EFFORT,
} from './schemas/enums';
// Schema-inferred types (replaces proto types)
export type {
  ImageGenerationMode,
  ImageGenerationSupport,
  ImageModeDef,
  ModelConfig,
  ModelConfig as ProtoModelConfig,
  ModelPricing,
  ModelPricing as ProtoModelPricing,
  ReasoningSupport as ProtoReasoningSupport,
  ReasoningSupport,
  SupportSpec,
} from './schemas/model';
// Runtime schemas (zod) — needed by shared types that compose them
export { ImageGenerationSupportSchema } from './schemas/model';
export type {
  ProviderConfig as ProtoProviderConfig,
  ProviderConfig,
  ProviderReasoningFormat as ProtoProviderReasoningFormat,
  ProviderReasoningFormat,
  RegistryEndpointConfig,
} from './schemas/provider';
export type {
  ProviderModelOverride as ProtoProviderModelOverride,
  ProviderModelOverride,
} from './schemas/provider-models';
// Model ID normalization utilities
export { normalizeModelId } from './utils/normalize';
