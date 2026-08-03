/**
 * Cherry Studio Registry
 * Main entry point for the model and provider registry system
 */

// Reasoning-control heuristics — INGEST-time only (generation enrichment,
// custom-model creation); never a runtime capability source.
export {
  inferReasoningControls,
  inferReasoningMembership,
  inferReasoningOwnedBy,
} from './patterns/reasoning-heuristics';
// Shared vendor identity regex — consumed by @shared capability inference
// and @cherrystudio/ui icon routing. Single source of truth for "which
// vendor does this raw model ID belong to".
export type { VendorKey } from './patterns/vendor-patterns';
export { isVendor, matchVendor, VENDOR_PATTERNS } from './patterns/vendor-patterns';
// Schema-inferred types (replaces proto types)
export { REASONING_FORMAT_PROFILES } from './reasoningProfiles';
// Pure lookup and transformation utilities (no fs dependency)
export type {
  ModelLookupResult,
  PersistedEndpointConfig,
  RuntimeEndpointConfig,
} from './registry-utils';
export {
  buildPersistedEndpointConfigs,
  buildRuntimeEndpointConfigs,
  endpointImpliedCapability,
  inferAdapterFamily,
  lookupRegistryModel,
  lookupRegistryProvider,
} from './registry-utils';
// Enum types (PascalCase, derived from const objects)
export type {
  CanonicalParamKey,
  Currency,
  EndpointType,
  Modality,
  ModelCapability,
  ReasoningEffort,
} from './schemas/enums';
// Enums — const objects (SCREAMING_CASE)
export {
  CANONICAL_PARAM_KEY,
  CURRENCY,
  ENDPOINT_TYPE,
  MODALITY,
  MODEL_CAPABILITY,
  objectValues,
  REASONING_EFFORT,
  REASONING_EFFORT_ORDER,
} from './schemas/enums';
// Runtime schemas (zod) — needed by shared types that compose them
export type { ImageParamCatalogEntry, ParamValue, ParamValues } from './schemas/imageParamCatalog';
export {
  IMAGE_PARAM_CATALOG,
  IMAGE_PARAM_CATALOG_KEYS,
  imageParamsSchema,
  paramCatalogEntry,
  wireName,
} from './schemas/imageParamCatalog';
export type {
  ImageGenerationMode,
  ImageGenerationSupport,
  ImageModeDef,
  ModelConfig,
  ModelConfig as ProtoModelConfig,
  ModelPricing,
  ModelPricing as ProtoModelPricing,
  ReasoningControl,
  ReasoningSupport as ProtoReasoningSupport,
  ReasoningSupport,
  SupportSpec,
} from './schemas/model';
export {
  ImageGenerationModeSchema,
  ImageGenerationSupportSchema,
  ReasoningControlSchema,
} from './schemas/model';
export type {
  ProviderConfig as ProtoProviderConfig,
  ProviderConfig,
  ProviderReasoningFormat as ProtoProviderReasoningFormat,
  ProviderReasoningFormat,
  ReasoningFormatType,
  RegistryEndpointConfig,
} from './schemas/provider';
export { FastModeTransportSchema, REASONING_FORMAT_TYPES } from './schemas/provider';
export type {
  ProviderModelOverride as ProtoProviderModelOverride,
  ProviderModelOverride,
  ProviderModelReasoningContract,
} from './schemas/provider-models';
export { ProviderModelReasoningContractSchema } from './schemas/provider-models';
export type {
  ReasoningFormatWireProfile,
  ReasoningWireMode,
  ReasoningWireOperation,
  ReasoningWireProfile,
  ReasoningWireTarget,
  ReasoningWireValue,
} from './schemas/reasoningWire';
export {
  REASONING_WIRE_TARGETS,
  ReasoningFormatWireProfileSchema,
  ReasoningWireProfileSchema,
} from './schemas/reasoningWire';
export { buildParamsSchema } from './utils/buildParamsSchema';
// Model ID normalization utilities
export { normalizeModelId } from './utils/normalize';
export type { DerivedReasoningFields } from './utils/reasoningControls';
export { deriveLegacyReasoningFields } from './utils/reasoningControls';
