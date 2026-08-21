import {
  mergePresetModel,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

export function materializeRemoteModels(
  provider: Provider,
  remoteModels: readonly Partial<Model>[],
): Model[] {
  const seen = new Set<UniqueModelId>();
  const models: Model[] = [];

  for (const remoteModel of remoteModels) {
    const modelId = (remoteModel.apiModelId ?? remoteModel.modelId)?.trim();
    if (!modelId) {
      continue;
    }

    const id = createUniqueModelId(provider.id, modelId);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const baseModel: Model = {
      apiModelId: remoteModel.apiModelId ?? modelId,
      capabilities: remoteModel.capabilities ?? [],
      contextWindow: remoteModel.contextWindow,
      customEndpointUrl: remoteModel.customEndpointUrl,
      description: remoteModel.description,
      endpointTypes: remoteModel.endpointTypes,
      family: remoteModel.family,
      group: remoteModel.group,
      id,
      imageGeneration: remoteModel.imageGeneration,
      inputModalities: remoteModel.inputModalities,
      isDeprecated: remoteModel.isDeprecated ?? false,
      isEnabled: remoteModel.isEnabled ?? true,
      isHidden: remoteModel.isHidden ?? false,
      maxInputTokens: remoteModel.maxInputTokens,
      maxOutputTokens: remoteModel.maxOutputTokens,
      modelId,
      name: remoteModel.name?.trim() || modelId,
      outputModalities: remoteModel.outputModalities,
      ownedBy: remoteModel.ownedBy,
      parameters: remoteModel.parameters,
      presetModelId: remoteModel.presetModelId,
      pricing: remoteModel.pricing,
      providerId: provider.id,
      reasoning: remoteModel.reasoning,
      replaceWith: remoteModel.replaceWith,
      supportsStreaming: remoteModel.supportsStreaming ?? true,
    };

    models.push(enrichFromRegistry(baseModel, provider));
  }

  return models;
}

function enrichFromRegistry(model: Model, provider: Provider): Model {
  const registryData = providerRegistryService.lookupModel(provider.id, model.modelId, {
    defaultChatEndpoint: provider.defaultChatEndpoint,
    presetProviderId: provider.presetProviderId,
  });
  if (!registryData.presetModel) {
    return model;
  }

  const merged = mergePresetModel(
    registryData.presetModel,
    registryData.registryOverride,
    model.providerId,
    registryData.reasoningProfile.wire,
    registryData.reasoningProfile.support,
  );

  return {
    ...model,
    capabilities:
      preferRegistryArray(merged.capabilities, model.capabilities) ?? model.capabilities,
    contextWindow: merged.contextWindow ?? model.contextWindow,
    description: merged.description ?? model.description,
    endpointTypes: preferRegistryArray(merged.endpointTypes, model.endpointTypes),
    family: merged.family ?? model.family,
    group: merged.group ?? model.group,
    imageGeneration: merged.imageGeneration ?? model.imageGeneration,
    inputModalities: preferRegistryArray(merged.inputModalities, model.inputModalities),
    maxInputTokens: merged.maxInputTokens ?? model.maxInputTokens,
    maxOutputTokens: merged.maxOutputTokens ?? model.maxOutputTokens,
    name: merged.name,
    outputModalities: preferRegistryArray(merged.outputModalities, model.outputModalities),
    ownedBy: merged.ownedBy ?? model.ownedBy,
    parameters: merged.parameters ?? model.parameters,
    presetModelId: registryData.presetModel.id,
    pricing: merged.pricing ?? model.pricing,
    reasoning: merged.reasoning ?? model.reasoning,
    replaceWith: merged.replaceWith ?? model.replaceWith,
  };
}

function preferRegistryArray<TItem>(
  registryValue: TItem[] | undefined,
  fallbackValue: TItem[] | undefined,
): TItem[] | undefined {
  return registryValue && registryValue.length > 0 ? registryValue : fallbackValue;
}
