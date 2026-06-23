import type {
  EndpointType,
  ModelCapability,
  ProtoModelConfig,
  ProtoProviderModelOverride,
  ProtoReasoningSupport,
  ReasoningEffort,
} from '@cherrystudio/provider-registry';
import { ENDPOINT_TYPE, REASONING_EFFORT } from '@cherrystudio/provider-registry';
import {
  getMobileRegistryLoader,
  type MobileRegistryLoader,
} from '@cherrystudio/provider-registry/mobile';

import { createUniqueModelId, type Model } from '@/data/types/model';
import type { EndpointConfigs, ProviderWebsites } from '@/data/types/provider';

const chatReasoningEndpointPriority: EndpointType[] = [
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OLLAMA_CHAT,
  ENDPOINT_TYPE.OLLAMA_GENERATE,
  ENDPOINT_TYPE.OPENAI_TEXT_COMPLETIONS,
];

const reasoningFormatTypes = [
  'openai-chat',
  'openai-responses',
  'anthropic',
  'gemini',
  'openrouter',
  'enable-thinking',
  'thinking-type',
  'dashscope',
  'self-hosted',
] as const;

export type ReasoningFormatType = (typeof reasoningFormatTypes)[number];

const defaultEfforts: Partial<Record<ReasoningFormatType, ReasoningEffort[]>> = {
  anthropic: [],
  'enable-thinking': [
    REASONING_EFFORT.NONE,
    REASONING_EFFORT.LOW,
    REASONING_EFFORT.MEDIUM,
    REASONING_EFFORT.HIGH,
  ],
  gemini: [REASONING_EFFORT.LOW, REASONING_EFFORT.MEDIUM, REASONING_EFFORT.HIGH],
  'openai-chat': [
    REASONING_EFFORT.NONE,
    REASONING_EFFORT.MINIMAL,
    REASONING_EFFORT.LOW,
    REASONING_EFFORT.MEDIUM,
    REASONING_EFFORT.HIGH,
  ],
  'openai-responses': [
    REASONING_EFFORT.NONE,
    REASONING_EFFORT.MINIMAL,
    REASONING_EFFORT.LOW,
    REASONING_EFFORT.MEDIUM,
    REASONING_EFFORT.HIGH,
  ],
  'thinking-type': [REASONING_EFFORT.NONE, REASONING_EFFORT.AUTO],
};

export type ProviderDisplayMetadata = {
  description?: string;
  websites?: ProviderWebsites;
};

export type ModelRegistryLookup = {
  defaultChatEndpoint?: EndpointType;
  presetModel: ProtoModelConfig | null;
  reasoningFormatTypes?: Partial<Record<EndpointType, ReasoningFormatType>>;
  registryOverride: ProtoProviderModelOverride | null;
};

function isReasoningFormatType(value: string): value is ReasoningFormatType {
  return (reasoningFormatTypes as readonly string[]).includes(value);
}

export function extractReasoningFormatTypes(
  endpointConfigs: EndpointConfigs | null | undefined,
): Partial<Record<EndpointType, ReasoningFormatType>> | undefined {
  if (!endpointConfigs) {
    return undefined;
  }

  const result: Partial<Record<EndpointType, ReasoningFormatType>> = {};
  for (const [key, config] of Object.entries(endpointConfigs)) {
    const type = config?.reasoningFormatType;
    if (type && isReasoningFormatType(type)) {
      result[key as EndpointType] = type;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function isChatReasoningEndpointType(endpointType: EndpointType): boolean {
  return chatReasoningEndpointPriority.includes(endpointType);
}

function resolveReasoningEndpointType(
  endpointTypes: EndpointType[] | undefined,
  defaultChatEndpoint: EndpointType | undefined,
): EndpointType | undefined {
  const candidates = (endpointTypes ?? []).filter(isChatReasoningEndpointType);

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (defaultChatEndpoint !== undefined && isChatReasoningEndpointType(defaultChatEndpoint)) {
    if (candidates.length === 0 || candidates.includes(defaultChatEndpoint)) {
      return defaultChatEndpoint;
    }
  }

  return chatReasoningEndpointPriority.find((endpointType) => candidates.includes(endpointType));
}

function resolveReasoningFormatType(
  endpointTypes: EndpointType[] | undefined,
  defaultChatEndpoint: EndpointType | undefined,
  reasoningTypes: Partial<Record<EndpointType, ReasoningFormatType>> | undefined,
): ReasoningFormatType | undefined {
  const endpointType = resolveReasoningEndpointType(endpointTypes, defaultChatEndpoint);
  return endpointType ? reasoningTypes?.[endpointType] : undefined;
}

function extractRuntimeReasoning(
  reasoning: ProtoReasoningSupport,
  reasoningFormatType: ReasoningFormatType | undefined,
): Model['reasoning'] {
  const type = reasoningFormatType ?? '';
  let supportedEfforts = [...(reasoning.supportedEfforts ?? [])];
  if (supportedEfforts.length === 0 && reasoningFormatType) {
    supportedEfforts = defaultEfforts[reasoningFormatType] ?? [];
  }

  return {
    supportedEfforts,
    thinkingTokenLimits: reasoning.thinkingTokenLimits,
    type,
  };
}

export function applyCapabilityOverride(
  base: ModelCapability[],
  override: ProtoProviderModelOverride['capabilities'] | null | undefined,
): ModelCapability[] {
  if (!override) {
    return [...base];
  }

  if (override.force && override.force.length > 0) {
    return [...override.force];
  }

  let result = [...base];
  if (override.add?.length) {
    result = Array.from(new Set([...result, ...override.add]));
  }

  if (override.remove?.length) {
    const removeSet = new Set(override.remove);
    result = result.filter((capability) => !removeSet.has(capability));
  }

  return result;
}

export function createCustomModel(providerId: string, modelId: string): Model {
  return {
    apiModelId: modelId,
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
  };
}

export function mergePresetModel(
  presetModel: ProtoModelConfig,
  catalogOverride: ProtoProviderModelOverride | null,
  providerId: string,
  reasoningTypes?: Partial<Record<EndpointType, ReasoningFormatType>>,
  defaultChatEndpoint?: EndpointType,
): Model {
  const capabilities = applyCapabilityOverride(
    [...(presetModel.capabilities ?? [])],
    catalogOverride?.capabilities,
  );
  const endpointTypes = catalogOverride?.endpointTypes?.length
    ? [...catalogOverride.endpointTypes]
    : undefined;
  const reasoningFormatType = resolveReasoningFormatType(
    endpointTypes,
    defaultChatEndpoint,
    reasoningTypes,
  );
  const reasoningSource = catalogOverride?.reasoning ?? presetModel.reasoning;
  const pricing =
    presetModel.pricing && catalogOverride?.pricing
      ? {
          ...presetModel.pricing,
          ...catalogOverride.pricing,
        }
      : presetModel.pricing;

  return {
    apiModelId: catalogOverride?.apiModelId ?? presetModel.id,
    capabilities,
    contextWindow: catalogOverride?.limits?.contextWindow ?? presetModel.contextWindow,
    description: presetModel.description,
    endpointTypes,
    family: presetModel.family,
    id: createUniqueModelId(providerId, presetModel.id),
    inputModalities: catalogOverride?.inputModalities ?? presetModel.inputModalities,
    isDeprecated: false,
    isEnabled: !(catalogOverride?.disabled ?? false),
    isHidden: false,
    maxInputTokens: catalogOverride?.limits?.maxInputTokens ?? presetModel.maxInputTokens,
    maxOutputTokens: catalogOverride?.limits?.maxOutputTokens ?? presetModel.maxOutputTokens,
    modelId: presetModel.id,
    name: presetModel.name ?? presetModel.id,
    outputModalities: catalogOverride?.outputModalities ?? presetModel.outputModalities,
    ownedBy: presetModel.ownedBy,
    parameters: catalogOverride?.parameterSupport ?? presetModel.parameterSupport,
    presetModelId: presetModel.id,
    pricing,
    providerId,
    reasoning: reasoningSource
      ? extractRuntimeReasoning(reasoningSource, reasoningFormatType)
      : undefined,
    supportsStreaming: true,
  };
}

export class ProviderRegistryService {
  constructor(private readonly loader: MobileRegistryLoader = getMobileRegistryLoader()) {}

  clearCache() {
    this.loader.invalidate();
  }

  getProvidersVersion() {
    return this.loader.getProvidersVersion();
  }

  loadProviders() {
    return this.loader.loadProviders();
  }

  getProviderDisplayMetadata(
    providerId: string,
    presetProviderId?: string,
  ): ProviderDisplayMetadata {
    const provider =
      this.loader.loadProviders().find((item) => item.id === providerId) ??
      (presetProviderId
        ? this.loader.loadProviders().find((item) => item.id === presetProviderId)
        : undefined);

    return {
      description: provider?.description,
      websites: provider?.metadata?.website,
    };
  }

  lookupModel(
    providerId: string,
    modelId: string,
    providerConfig?: {
      defaultChatEndpoint?: EndpointType | null;
      endpointConfigs?: EndpointConfigs | null;
    },
  ): ModelRegistryLookup {
    return {
      defaultChatEndpoint: providerConfig?.defaultChatEndpoint ?? undefined,
      presetModel: this.loader.findModel(modelId),
      reasoningFormatTypes: extractReasoningFormatTypes(providerConfig?.endpointConfigs),
      registryOverride: this.loader.findOverride(providerId, modelId),
    };
  }
}

export const providerRegistryService = new ProviderRegistryService();
