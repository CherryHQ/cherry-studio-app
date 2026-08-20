import { MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

export type ModelPickerModelItem = {
  key: string;
  model: Model;
  modelId: UniqueModelId;
  provider: Provider;
};

export type ModelPickerGroup = {
  items: ModelPickerModelItem[];
  key: string;
  provider: Provider;
  title: string;
};

export const MODEL_PICKER_TAGS = [
  MODEL_CAPABILITY.IMAGE_RECOGNITION,
  MODEL_CAPABILITY.AUDIO_RECOGNITION,
  MODEL_CAPABILITY.EMBEDDING,
  MODEL_CAPABILITY.REASONING,
  MODEL_CAPABILITY.FUNCTION_CALL,
  MODEL_CAPABILITY.WEB_SEARCH,
  MODEL_CAPABILITY.RERANK,
  MODEL_CAPABILITY.IMAGE_GENERATION,
  MODEL_CAPABILITY.CODE_EXECUTION,
] as const;

export const MODEL_PICKER_FILTER_TAGS = [
  MODEL_CAPABILITY.REASONING,
  MODEL_CAPABILITY.IMAGE_RECOGNITION,
  MODEL_CAPABILITY.FUNCTION_CALL,
  MODEL_CAPABILITY.WEB_SEARCH,
  MODEL_CAPABILITY.EMBEDDING,
  MODEL_CAPABILITY.RERANK,
  'free',
] as const;

export type ModelPickerTag =
  | (typeof MODEL_PICKER_TAGS)[number]
  | (typeof MODEL_PICKER_FILTER_TAGS)[number];

const MODEL_PICKER_TAG_LABEL_KEYS = {
  [MODEL_CAPABILITY.AUDIO_RECOGNITION]: 'models.capability.audioRecognition',
  [MODEL_CAPABILITY.CODE_EXECUTION]: 'models.capability.codeExecution',
  [MODEL_CAPABILITY.EMBEDDING]: 'models.capability.embedding',
  [MODEL_CAPABILITY.FUNCTION_CALL]: 'models.capability.functionCall',
  [MODEL_CAPABILITY.IMAGE_GENERATION]: 'models.capability.imageGeneration',
  [MODEL_CAPABILITY.IMAGE_RECOGNITION]: 'models.capability.imageRecognition',
  [MODEL_CAPABILITY.REASONING]: 'models.capability.reasoning',
  [MODEL_CAPABILITY.RERANK]: 'models.capability.rerank',
  [MODEL_CAPABILITY.WEB_SEARCH]: 'models.capability.webSearch',
  free: 'models.capability.free',
} as const satisfies Record<ModelPickerTag, string>;

export function getModelPickerModelItem(
  modelId: string | null,
  {
    models,
    providers,
  }: {
    models: readonly Model[];
    providers: readonly Provider[];
  },
): ModelPickerModelItem | undefined {
  const selectableModels = getSelectableModelPickerModels(models, providers);
  const model = selectableModels.find((item) => item.id === modelId);
  const provider = model ? providers.find((item) => item.id === model.providerId) : undefined;

  if (!model || !provider) {
    return undefined;
  }

  return createModelPickerItem({ model, provider, suffix: 'selected' });
}

export function getModelPickerTagLabelKey(tag: ModelPickerTag) {
  return MODEL_PICKER_TAG_LABEL_KEYS[tag];
}

export function getModelPickerTags(model: Model): ModelPickerTag[] {
  return MODEL_PICKER_TAGS.filter((tag) => matchesModelPickerTag(model, tag));
}

/**
 * The badges a model row shows, wherever one is drawn. Free is not a declared
 * capability — it is read off the model — so it is not among the tags above and
 * has to be appended.
 */
export function getModelPickerRowTags(model: Model): ModelPickerTag[] {
  const tags = getModelPickerTags(model);

  return isFreeModel(model) ? [...tags, 'free'] : tags;
}

export function getAvailableModelPickerFilterTags({
  models,
  providers,
}: {
  models: readonly Model[];
  providers: readonly Provider[];
}): ModelPickerTag[] {
  const selectableModels = getSelectableModelPickerModels(models, providers);

  return getAvailableModelPickerFilterTagsForModels(selectableModels);
}

export function getAvailableModelPickerFilterTagsForModels(
  models: readonly Model[],
): ModelPickerTag[] {
  if (models.length === 0) {
    return [];
  }

  return MODEL_PICKER_FILTER_TAGS.filter((tag) =>
    models.some((model) => matchesModelPickerTag(model, tag)),
  );
}

export function filterModelsByModelPickerTags(
  models: readonly Model[],
  selectedTags: readonly ModelPickerTag[],
): Model[] {
  return models.filter((model) => matchesModelPickerSelectedTags(model, selectedTags));
}

export function buildModelPickerGroups({
  models,
  providers,
  searchText,
  selectedTags = [],
}: {
  models: readonly Model[];
  providers: readonly Provider[];
  searchText: string;
  selectedTags?: readonly ModelPickerTag[];
}): ModelPickerGroup[] {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const keywords = getSearchKeywords(searchText);
  const selectableModels = getSelectableModelPickerModels(models, providers);
  const filteredModels = selectableModels.filter((model) => {
    const provider = providerById.get(model.providerId);

    return provider
      ? matchesModelPickerKeywords(model, provider, keywords) &&
          matchesModelPickerSelectedTags(model, selectedTags)
      : false;
  });
  const groups: ModelPickerGroup[] = [];

  for (const provider of providers) {
    if (!provider.isEnabled) {
      continue;
    }

    const providerModels = filteredModels.filter((model) => model.providerId === provider.id);

    if (providerModels.length === 0) {
      continue;
    }

    groups.push({
      items: providerModels.map((model) =>
        createModelPickerItem({ model, provider, suffix: 'provider' }),
      ),
      key: `provider:${provider.id}`,
      provider,
      title: provider.name,
    });
  }

  return groups;
}

function createModelPickerItem({
  model,
  provider,
  suffix,
}: {
  model: Model;
  provider: Provider;
  suffix: string;
}): ModelPickerModelItem {
  return {
    key: `${model.id}:${suffix}`,
    model,
    modelId: model.id,
    provider,
  };
}

export function isFreeModel(model: Model): boolean {
  if (model.providerId === 'cherryai') {
    return true;
  }

  return [model.id, model.modelId, model.name, model.presetModelId]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes('free');
}

function matchesModelPickerTag(model: Model, tag: ModelPickerTag): boolean {
  if (tag === 'free') {
    return isFreeModel(model);
  }

  switch (tag) {
    case MODEL_CAPABILITY.AUDIO_RECOGNITION:
      return (
        model.capabilities.includes(MODEL_CAPABILITY.AUDIO_RECOGNITION) ||
        Boolean(model.inputModalities?.includes(MODALITY.AUDIO))
      );
    default:
      return model.capabilities.includes(tag);
  }
}

function matchesModelPickerSelectedTags(
  model: Model,
  selectedTags: readonly ModelPickerTag[],
): boolean {
  if (selectedTags.length === 0) {
    return true;
  }

  return selectedTags.every((tag) => matchesModelPickerTag(model, tag));
}

// Capabilities for models that can't be used in chat, so they're excluded from the picker.
const CHAT_UNSUPPORTED_CAPABILITIES = [
  MODEL_CAPABILITY.AUDIO_RECOGNITION,
  MODEL_CAPABILITY.EMBEDDING,
  MODEL_CAPABILITY.RERANK,
] as const;

function isChatCapableModel(model: Model): boolean {
  return !CHAT_UNSUPPORTED_CAPABILITIES.some((capability) =>
    model.capabilities.includes(capability),
  );
}

function getSelectableModelPickerModels(models: readonly Model[], providers: readonly Provider[]) {
  const enabledProviderIds = new Set(
    providers.flatMap((provider) => (provider.isEnabled ? [provider.id] : [])),
  );

  return models.filter(
    (model) =>
      model.isEnabled &&
      !model.isHidden &&
      enabledProviderIds.has(model.providerId) &&
      isChatCapableModel(model),
  );
}

function getSearchKeywords(searchText: string): string[] {
  return searchText
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function matchesModelPickerKeywords(
  model: Model,
  provider: Provider,
  keywords: readonly string[],
): boolean {
  if (keywords.length === 0) {
    return true;
  }

  const haystack = [
    model.id,
    model.modelId,
    model.name,
    model.presetModelId,
    model.description,
    provider.id,
    provider.name,
    provider.presetProviderId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

  return keywords.every((keyword) => haystack.includes(keyword));
}
