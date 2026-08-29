import type {
  Currency,
  EndpointType,
  ModelCapability,
  ProtoModelConfig,
  ProtoProviderModelOverride,
  ProtoReasoningSupport,
  ProviderModelReasoningContract,
  ProviderReasoningFormat,
  ReasoningEffort,
  ReasoningFormatType,
  ReasoningWireProfile,
} from '@cherrystudio/provider-registry';
import {
  deriveLegacyReasoningFields,
  ENDPOINT_TYPE,
  inferReasoningControls,
  inferReasoningMembership,
  inferReasoningOwnedBy,
  MODEL_CAPABILITY,
  REASONING_EFFORT,
  REASONING_FORMAT_PROFILES,
} from '@cherrystudio/provider-registry';
import {
  getMobileRegistryLoader,
  type MobileRemoteRegistrySnapshot,
  type MobileRegistryLoader,
  type RemoteRegistryFileName,
} from '@cherrystudio/provider-registry/mobile';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type {
  ApiFeatures,
  ProviderAuthMethod,
  ProviderModelListSource,
  ProviderWebsites,
} from '@/shared/data/types/provider';

const chatReasoningEndpointPriority: EndpointType[] = [
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OLLAMA_CHAT,
  ENDPOINT_TYPE.OLLAMA_GENERATE,
  ENDPOINT_TYPE.OPENAI_TEXT_COMPLETIONS,
];

const defaultFormatByEndpoint: Partial<Record<EndpointType, ReasoningFormatType>> = {
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'anthropic',
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'gemini',
  [ENDPOINT_TYPE.OLLAMA_CHAT]: 'ollama',
  [ENDPOINT_TYPE.OLLAMA_GENERATE]: 'ollama',
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'openai-chat',
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'openai-responses',
  [ENDPOINT_TYPE.OPENAI_TEXT_COMPLETIONS]: 'openai-chat',
};

export type ResolvedReasoningProfile = {
  format: ReasoningFormatType;
  support?: ProtoReasoningSupport;
  wire: ReasoningWireProfile;
};

export type ProviderDisplayMetadata = {
  apiFeatures?: ApiFeatures;
  authMethods?: ProviderAuthMethod[];
  authOptional?: boolean;
  description?: string;
  fastMode?: { transport: 'openai-priority' };
  modelListSource?: ProviderModelListSource;
  reportedCostCurrency?: Currency;
  websites?: ProviderWebsites;
};

export type ListProviderRegistryModelsOptions = {
  disabled?: boolean;
  presetProviderId?: string | null;
  providerId?: string;
};

export type ModelRegistryLookup = {
  presetModel: ProtoModelConfig | null;
  reasoningProfile: ResolvedReasoningProfile;
  registryOverride: ProtoProviderModelOverride | null;
};

/**
 * Connection facts the reasoning profile depends on. Mobile passes them in
 * explicitly because this service never reads the database.
 */
export type ReasoningProviderContext = {
  defaultChatEndpoint?: EndpointType | null;
  id: string;
  presetProviderId?: string | null;
};

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

export function resolveReasoningProfileFromRegistry(input: {
  contract?: ProviderModelReasoningContract;
  endpointType: EndpointType | undefined;
  format?: ProviderReasoningFormat;
}): ResolvedReasoningProfile {
  const endpointDefault = input.endpointType
    ? defaultFormatByEndpoint[input.endpointType]
    : undefined;
  const format = input.format?.type ?? endpointDefault ?? 'openai-chat';
  const formatDefault = REASONING_FORMAT_PROFILES[format];
  return {
    format,
    support: input.contract?.support,
    wire: input.contract?.wire ?? input.format?.wire ?? formatDefault.wire,
  };
}

function deriveSelectableEfforts(reasoning: ProtoReasoningSupport, profile: ReasoningWireProfile) {
  if (profile.disabled) return [];
  const effortControl = reasoning.controls?.find((control) => control.kind === 'effort');
  const hasDeclaredControls = reasoning.controls !== undefined;
  const hasBudget = reasoning.controls?.some((control) => control.kind === 'budget') ?? false;
  const hasToggle = reasoning.controls?.some((control) => control.kind === 'toggle') ?? false;

  let intrinsic: ReasoningEffort[];
  if (effortControl?.kind === 'effort') {
    intrinsic = [
      ...effortControl.values,
      ...(hasToggle && !effortControl.values.includes(REASONING_EFFORT.NONE)
        ? [REASONING_EFFORT.NONE]
        : []),
    ];
  } else if (!hasDeclaredControls && reasoning.supportedEfforts?.length) {
    intrinsic = [...reasoning.supportedEfforts];
  } else if (hasBudget) {
    intrinsic = [
      ...(hasToggle ? [REASONING_EFFORT.NONE] : []),
      REASONING_EFFORT.LOW,
      REASONING_EFFORT.MEDIUM,
      REASONING_EFFORT.HIGH,
    ];
  } else if (hasToggle) {
    intrinsic = [REASONING_EFFORT.NONE, REASONING_EFFORT.AUTO];
  } else {
    intrinsic = [];
  }

  return intrinsic.filter((selection) => {
    if (selection === REASONING_EFFORT.NONE) return profile.off !== undefined;
    if (selection === REASONING_EFFORT.AUTO) {
      return profile.auto !== undefined || profile.effort !== undefined;
    }
    return profile.effort !== undefined;
  });
}

function mergeReasoningSupport(
  preset: ProtoReasoningSupport | undefined,
  override: ProtoReasoningSupport | undefined,
): ProtoReasoningSupport | undefined {
  if (!preset && !override) {
    return undefined;
  }

  return {
    controls: override?.controls ?? preset?.controls,
    defaultEffort: override?.defaultEffort ?? preset?.defaultEffort,
    supportedEfforts: override?.supportedEfforts ?? preset?.supportedEfforts,
    thinkingTokenLimits: override?.thinkingTokenLimits ?? preset?.thinkingTokenLimits,
  };
}

export function projectRuntimeReasoning(
  reasoning: ProtoReasoningSupport,
  profile: ReasoningWireProfile,
): NonNullable<Model['reasoning']> {
  return {
    controls: reasoning.controls,
    defaultEffort: reasoning.defaultEffort,
    selectableEfforts: deriveSelectableEfforts(reasoning, profile),
    thinkingTokenLimits: reasoning.thinkingTokenLimits,
  };
}

export function inferCustomModelReasoning(
  modelId: string,
  profile: ReasoningWireProfile = REASONING_FORMAT_PROFILES['openai-chat'].wire,
  options?: { declaredReasoning?: boolean },
): Model['reasoning'] {
  if (!options?.declaredReasoning && !inferReasoningMembership(modelId)) return undefined;
  const controls = inferReasoningControls(modelId);
  if (!controls) return undefined;
  return projectRuntimeReasoning({ controls, ...deriveLegacyReasoningFields(controls) }, profile);
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

export function createCustomModel(
  providerId: string,
  modelId: string,
  profile: ReasoningWireProfile = REASONING_FORMAT_PROFILES['openai-chat'].wire,
): Model {
  const reasoning = inferCustomModelReasoning(modelId, profile);
  return {
    apiModelId: modelId,
    capabilities: [],
    id: createUniqueModelId(providerId, modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    ownedBy: inferReasoningOwnedBy(modelId),
    providerId,
    reasoning,
    supportsStreaming: true,
  };
}

export function synthesizePresetFromOverride(
  override: ProtoProviderModelOverride,
): ProtoModelConfig {
  const capabilities = override.capabilities?.force ?? override.capabilities?.add ?? [];

  return {
    capabilities,
    description: override.description,
    family: override.family,
    id: override.modelId,
    imageGeneration: override.imageGeneration,
    inputModalities: override.inputModalities,
    name: override.name ?? override.modelId,
    outputModalities: override.outputModalities,
    ownedBy: override.ownedBy,
    pricing: override.pricing as ProtoModelConfig['pricing'],
  };
}

export function mergePresetModel(
  presetModel: ProtoModelConfig,
  catalogOverride: ProtoProviderModelOverride | null,
  providerId: string,
  profile: ReasoningWireProfile = REASONING_FORMAT_PROFILES['openai-chat'].wire,
  reasoningSupport?: ProtoReasoningSupport,
): Model {
  const apiModelId = catalogOverride?.apiModelId ?? presetModel.id;
  const baseCapabilities = applyCapabilityOverride(
    [...(presetModel.capabilities ?? [])],
    catalogOverride?.capabilities,
  );
  const endpointTypes = catalogOverride?.endpointTypes?.length
    ? [...catalogOverride.endpointTypes]
    : undefined;
  const reasoningSource = reasoningSupport ?? presetModel.reasoning;
  const capabilities = reasoningSupport
    ? Array.from(new Set([...baseCapabilities, MODEL_CAPABILITY.REASONING]))
    : baseCapabilities;
  const pricing =
    presetModel.pricing && catalogOverride?.pricing
      ? {
          ...presetModel.pricing,
          ...catalogOverride.pricing,
        }
      : presetModel.pricing;

  return {
    apiModelId,
    capabilities,
    contextWindow: catalogOverride?.limits?.contextWindow ?? presetModel.contextWindow,
    description: catalogOverride?.description ?? presetModel.description,
    endpointTypes,
    family: catalogOverride?.family ?? presetModel.family,
    id: createUniqueModelId(providerId, apiModelId),
    imageGeneration: catalogOverride?.imageGeneration ?? presetModel.imageGeneration,
    inputModalities: catalogOverride?.inputModalities ?? presetModel.inputModalities,
    isDeprecated: false,
    isEnabled: !(catalogOverride?.disabled ?? false),
    isHidden: false,
    maxInputTokens: catalogOverride?.limits?.maxInputTokens ?? presetModel.maxInputTokens,
    maxOutputTokens: catalogOverride?.limits?.maxOutputTokens ?? presetModel.maxOutputTokens,
    modelId: presetModel.id,
    name: catalogOverride?.name ?? presetModel.name ?? presetModel.id,
    outputModalities: catalogOverride?.outputModalities ?? presetModel.outputModalities,
    ownedBy: catalogOverride?.ownedBy ?? presetModel.ownedBy,
    parameterSupport: (catalogOverride?.parameterSupport ??
      presetModel.parameterSupport) as Model['parameterSupport'],
    presetModelId: presetModel.id,
    pricing,
    providerId,
    reasoning: reasoningSource ? projectRuntimeReasoning(reasoningSource, profile) : undefined,
    replaceWith: catalogOverride?.replaceWith
      ? createUniqueModelId(providerId, catalogOverride.replaceWith)
      : undefined,
    supportsStreaming: true,
    ...(catalogOverride?.supportsFastMode ? { supportsFastMode: true } : {}),
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

  getProviderModelsVersion() {
    return this.loader.getProviderModelsVersion();
  }

  getCatalogVersion(file: RemoteRegistryFileName): string {
    return file === 'models.json'
      ? this.loader.getModelsVersion()
      : this.loader.getProviderModelsVersion();
  }

  getBundledCatalogVersions() {
    return this.loader.getBundledCatalogVersions();
  }

  parseRemoteSnapshot(input: { models: unknown; providerModels: unknown }) {
    return this.loader.parseRemoteSnapshot(input);
  }

  installRemoteSnapshot(snapshot: MobileRemoteRegistrySnapshot): void {
    this.loader.installRemoteSnapshot(snapshot);
  }

  clearRemoteSnapshot(): void {
    this.loader.clearRemoteSnapshot();
  }

  loadProviders() {
    return this.loader.loadProviders();
  }

  isRegistryProvider(providerId: string): boolean {
    return this.loader.findProvider(providerId) !== null;
  }

  isProviderExcluded(providerId: string): boolean {
    return this.loader.isProviderExcluded(providerId);
  }

  getExcludedProviderIds(): readonly string[] {
    return this.loader.getExcludedProviderIds();
  }

  getProviderDisplayMetadata(
    providerId: string,
    presetProviderId?: string,
  ): ProviderDisplayMetadata {
    const provider =
      this.loader.findProvider(providerId) ??
      (presetProviderId ? this.loader.findProvider(presetProviderId) : undefined);

    return {
      apiFeatures: provider?.apiFeatures,
      authMethods: provider?.authMethods,
      authOptional: provider?.authOptional,
      description: provider?.description,
      // Presets may declare transports mobile has no runtime for (claude-code);
      // only the one the AI layer implements passes through.
      fastMode:
        provider?.fastMode?.transport === 'openai-priority'
          ? { transport: 'openai-priority' }
          : undefined,
      modelListSource: provider?.modelListSource,
      reportedCostCurrency: provider?.reportedCostCurrency,
      websites: provider?.metadata?.website,
    };
  }

  private findProfileProvider(context: Pick<ReasoningProviderContext, 'id' | 'presetProviderId'>) {
    if (context.presetProviderId === null) {
      return undefined;
    }

    return (
      this.loader.findProvider(context.id) ??
      (context.presetProviderId ? this.loader.findProvider(context.presetProviderId) : null) ??
      undefined
    );
  }

  /**
   * Resolve the endpoint-projected reasoning profile for one registry model.
   * Wire details stay in registry memory and never reach persisted rows.
   */
  private resolveProfileForModelData(
    context: ReasoningProviderContext,
    presetModel: ProtoModelConfig | null,
    registryOverride: ProtoProviderModelOverride | null,
    fallbackModelId: string,
  ): ResolvedReasoningProfile {
    const profileProvider = this.findProfileProvider(context);
    const endpointType = resolveReasoningEndpointType(
      registryOverride?.endpointTypes,
      context.defaultChatEndpoint ?? profileProvider?.defaultChatEndpoint ?? undefined,
    );
    const contract = endpointType
      ? (
          registryOverride?.reasoningContracts as
            | Partial<Record<EndpointType, ProviderModelReasoningContract>>
            | undefined
        )?.[endpointType]
      : undefined;
    const inferredControls =
      presetModel?.reasoning || contract?.support || !inferReasoningMembership(fallbackModelId)
        ? undefined
        : inferReasoningControls(fallbackModelId);
    const support =
      mergeReasoningSupport(presetModel?.reasoning, contract?.support) ??
      (inferredControls ? { controls: inferredControls } : undefined);

    return {
      ...resolveReasoningProfileFromRegistry({
        contract,
        endpointType,
        format: endpointType
          ? profileProvider?.endpointConfigs?.[endpointType]?.reasoningFormat
          : undefined,
      }),
      support,
    };
  }

  /** Resolve the backend-only wire profile for one already materialized request model. */
  resolveReasoningProfile(
    provider: ReasoningProviderContext,
    model: Model,
    endpointType?: EndpointType,
  ): ResolvedReasoningProfile {
    const profileProvider = this.findProfileProvider(provider);
    const effectiveEndpoint =
      endpointType ??
      resolveReasoningEndpointType(model.endpointTypes, provider.defaultChatEndpoint ?? undefined);
    const providerIds = Array.from(
      new Set(
        [provider.id, profileProvider?.id, provider.presetProviderId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );
    const modelIds = Array.from(
      new Set(
        [model.apiModelId, model.presetModelId].filter((value): value is string => Boolean(value)),
      ),
    );
    let contract: ProviderModelReasoningContract | undefined;
    let matchedOverride: ProtoProviderModelOverride | null = null;

    for (const providerId of providerIds) {
      for (const modelId of modelIds) {
        const candidate = this.loader.findOverride(providerId, modelId);
        contract = effectiveEndpoint
          ? (
              candidate?.reasoningContracts as
                | Partial<Record<EndpointType, ProviderModelReasoningContract>>
                | undefined
            )?.[effectiveEndpoint]
          : undefined;
        if (contract) matchedOverride = candidate;
        if (contract) break;
      }
      if (contract) break;
    }

    const resolved = resolveReasoningProfileFromRegistry({
      contract,
      endpointType: effectiveEndpoint,
      format: effectiveEndpoint
        ? profileProvider?.endpointConfigs?.[effectiveEndpoint]?.reasoningFormat
        : undefined,
    });
    const presetReasoning = this.loader.findModel(
      matchedOverride?.modelId ?? model.presetModelId ?? '',
    )?.reasoning;

    return {
      ...resolved,
      support: mergeReasoningSupport(presetReasoning ?? model.reasoning, contract?.support),
    };
  }

  lookupModel(
    providerId: string,
    modelId: string,
    providerConfig?: Omit<ReasoningProviderContext, 'id'>,
  ): ModelRegistryLookup {
    const registryOverride = this.loader.findOverride(providerId, modelId);
    const presetModel =
      this.loader.findModel(registryOverride?.modelId ?? modelId) ??
      (registryOverride ? synthesizePresetFromOverride(registryOverride) : null);

    return {
      presetModel,
      reasoningProfile: this.resolveProfileForModelData(
        { ...providerConfig, id: providerId },
        presetModel,
        registryOverride,
        modelId,
      ),
      registryOverride,
    };
  }

  resolveModels(
    providerId: string,
    modelIds: string[],
    providerConfig?: Omit<ReasoningProviderContext, 'id'>,
  ): Model[] {
    const results: Model[] = [];
    const seen = new Set<string>();
    const context: ReasoningProviderContext = { ...providerConfig, id: providerId };

    for (const modelId of modelIds) {
      if (!modelId || seen.has(modelId)) {
        continue;
      }
      seen.add(modelId);

      const registryOverride = this.loader.findOverride(providerId, modelId);
      const presetModel =
        this.loader.findModel(registryOverride?.modelId ?? modelId) ??
        (registryOverride ? synthesizePresetFromOverride(registryOverride) : null);
      const reasoningProfile = this.resolveProfileForModelData(
        context,
        presetModel,
        registryOverride,
        modelId,
      );

      if (!presetModel) {
        results.push(createCustomModel(providerId, modelId, reasoningProfile.wire));
        continue;
      }

      const model = mergePresetModel(
        presetModel,
        registryOverride,
        providerId,
        reasoningProfile.wire,
        reasoningProfile.support,
      );
      const apiModelId = model.apiModelId ?? registryOverride?.apiModelId ?? modelId;
      results.push({
        ...model,
        apiModelId,
        id: createUniqueModelId(providerId, apiModelId),
        presetModelId: presetModel.id,
      });
    }

    return results;
  }

  listProviderRegistryModels(options: ListProviderRegistryModelsOptions = {}): Model[] {
    const targetProviderId = options.providerId;
    const sourceProviderId = targetProviderId
      ? (this.loader.findProvider(targetProviderId)?.id ?? options.presetProviderId)
      : undefined;
    if (targetProviderId && !sourceProviderId) {
      return [];
    }

    const overrides = sourceProviderId
      ? this.loader.getOverridesForProvider(sourceProviderId)
      : this.loader.loadProviderModels();
    const includeDisabled = options.disabled ?? false;
    const results: Model[] = [];

    for (const override of overrides) {
      if ((override.disabled ?? false) !== includeDisabled) {
        continue;
      }

      const presetModel =
        this.loader.findModel(override.modelId) ?? synthesizePresetFromOverride(override);
      const providerId = targetProviderId ?? override.providerId;
      const provider = this.loader.findProvider(sourceProviderId ?? override.providerId);
      const reasoningProfile = this.resolveProfileForModelData(
        {
          defaultChatEndpoint: provider?.defaultChatEndpoint,
          id: providerId,
          presetProviderId: sourceProviderId ?? provider?.presetProviderId,
        },
        presetModel,
        override,
        override.apiModelId ?? override.modelId,
      );
      const model = mergePresetModel(
        presetModel,
        override,
        providerId,
        reasoningProfile.wire,
        reasoningProfile.support,
      );
      const apiModelId = model.apiModelId ?? override.apiModelId ?? override.modelId;
      results.push({
        ...model,
        apiModelId,
        id: createUniqueModelId(providerId, apiModelId),
        modelId: apiModelId,
        presetModelId: presetModel.id,
        providerId,
      });
    }

    return results;
  }

  getImageGenerationSupport(providerId: string, modelId: string): Model['imageGeneration'] | null {
    const { presetModel, registryOverride } = this.lookupModel(providerId, modelId);
    return registryOverride?.imageGeneration ?? presetModel?.imageGeneration ?? null;
  }
}

export const providerRegistryService = new ProviderRegistryService();
