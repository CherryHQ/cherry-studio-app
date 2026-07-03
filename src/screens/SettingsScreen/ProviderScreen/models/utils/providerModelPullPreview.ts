import type { CreateModelInput } from '@/data/services/ModelService';
import {
  type ModelRegistryLookup,
  mergePresetModel,
} from '@/data/services/ProviderRegistryService';
import { createUniqueModelId, type Model, type UniqueModelId } from '@/data/types/model';

export type ProviderModelPullPreview = {
  added: Model[];
  missing: Model[];
};

export type ProviderModelPullSelection = {
  addedIds: Set<UniqueModelId>;
  missingIds: Set<UniqueModelId>;
};

export type ProviderModelPullApplyPayload = {
  toAdd: CreateModelInput[];
  toRemove: UniqueModelId[];
};

type RemoteModelInput = Partial<Model>;
type ProviderModelPullRegistryResolver = (modelId: string) => ModelRegistryLookup;

export function buildProviderModelPullPreview({
  localModels,
  providerId,
  registryResolver,
  remoteModels,
}: {
  localModels: readonly Model[];
  providerId: string;
  registryResolver?: ProviderModelPullRegistryResolver;
  remoteModels: readonly RemoteModelInput[];
}): ProviderModelPullPreview {
  const normalizedRemoteModels = normalizeRemoteModels(providerId, remoteModels, registryResolver);
  const localIds = new Set(localModels.map((model) => model.id));
  const remoteIds = new Set(normalizedRemoteModels.map((model) => model.id));

  return {
    added: normalizedRemoteModels.filter((model) => !localIds.has(model.id)),
    missing: localModels.filter(
      (model) =>
        model.providerId === providerId &&
        !remoteIds.has(model.id) &&
        model.presetModelId != null &&
        model.presetModelId !== '',
    ),
  };
}

export function createDefaultProviderModelPullSelection(
  preview: ProviderModelPullPreview,
): ProviderModelPullSelection {
  return {
    addedIds: new Set(preview.added.map((model) => model.id)),
    missingIds: new Set(preview.missing.map((model) => model.id)),
  };
}

export function buildProviderModelPullApplyPayload(
  preview: ProviderModelPullPreview,
  selection: ProviderModelPullSelection,
): ProviderModelPullApplyPayload | null {
  const toAdd = preview.added
    .filter((model) => selection.addedIds.has(model.id))
    .map(modelToCreateModelInput);
  const toRemove = preview.missing
    .filter((model) => selection.missingIds.has(model.id))
    .map((model) => model.id);

  if (toAdd.length === 0 && toRemove.length === 0) {
    return null;
  }

  return { toAdd, toRemove };
}

function normalizeRemoteModels(
  providerId: string,
  remoteModels: readonly RemoteModelInput[],
  registryResolver?: ProviderModelPullRegistryResolver,
): Model[] {
  const seen = new Set<UniqueModelId>();
  const models: Model[] = [];

  for (const remoteModel of remoteModels) {
    const modelId = remoteModel.modelId?.trim();
    if (!modelId) {
      continue;
    }

    const id = createUniqueModelId(providerId, modelId);
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
      providerId,
      reasoning: remoteModel.reasoning,
      supportsStreaming: remoteModel.supportsStreaming ?? true,
    };

    models.push(enrichRemoteModelFromRegistry(baseModel, registryResolver));
  }

  return models;
}

function enrichRemoteModelFromRegistry(
  model: Model,
  registryResolver?: ProviderModelPullRegistryResolver,
): Model {
  const registryData = registryResolver?.(model.modelId);
  if (!registryData?.presetModel) {
    return model;
  }

  const merged = mergePresetModel(
    registryData.presetModel,
    registryData.registryOverride,
    model.providerId,
    registryData.reasoningFormatTypes,
    registryData.defaultChatEndpoint,
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
  };
}

function preferRegistryArray<TItem>(
  registryValue: TItem[] | undefined,
  fallbackValue: TItem[] | undefined,
): TItem[] | undefined {
  return registryValue && registryValue.length > 0 ? registryValue : fallbackValue;
}

function modelToCreateModelInput(model: Model): CreateModelInput {
  return {
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    description: model.description,
    endpointTypes: model.endpointTypes,
    group: model.group,
    inputModalities: model.inputModalities,
    isDeprecated: model.isDeprecated,
    isEnabled: model.isEnabled,
    isHidden: model.isHidden,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    modelId: model.modelId,
    name: model.name,
    outputModalities: model.outputModalities,
    ownedBy: model.ownedBy,
    parameters: model.parameters,
    presetModelId: model.presetModelId,
    pricing: model.pricing,
    providerId: model.providerId,
    reasoning: model.reasoning,
    supportsStreaming: model.supportsStreaming,
  };
}
