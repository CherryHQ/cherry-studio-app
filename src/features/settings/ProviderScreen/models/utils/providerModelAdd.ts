import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { CreateModelInput } from '@/data/services/ModelService';
import {
  createUniqueModelId,
  type EndpointType,
  type Model,
  type UniqueModelId,
} from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

export type ProviderModelAddFormState = {
  contextWindow: string;
  endpointTypes: EndpointType[];
  group: string;
  maxInputTokens: string;
  maxOutputTokens: string;
  modelId: string;
  name: string;
};

export type ProviderModelAddBuildResult = {
  duplicateIds: string[];
  inputs: CreateModelInput[];
};

export const providerModelAddDefaultEndpointType = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;

export const providerModelAddEndpointOptions = [
  { id: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, labelKey: 'endpoint_type.openai' },
  { id: ENDPOINT_TYPE.OPENAI_RESPONSES, labelKey: 'endpoint_type.openai-response' },
  { id: ENDPOINT_TYPE.ANTHROPIC_MESSAGES, labelKey: 'endpoint_type.anthropic' },
  { id: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, labelKey: 'endpoint_type.gemini' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, labelKey: 'endpoint_type.image-generation' },
  { id: ENDPOINT_TYPE.JINA_RERANK, labelKey: 'endpoint_type.jina-rerank' },
] as const satisfies readonly { id: EndpointType; labelKey: string }[];

const gatewayProviderIds = ['new-api', 'newapi', 'cherryin'] as const;

export function createInitialProviderModelAddFormState(
  endpointType: EndpointType = providerModelAddDefaultEndpointType,
): ProviderModelAddFormState {
  return {
    contextWindow: '',
    endpointTypes: [endpointType],
    group: '',
    maxInputTokens: '',
    maxOutputTokens: '',
    modelId: '',
    name: '',
  };
}

export function getDefaultProviderModelGroupName(id: string, providerId?: string): string {
  const str = id.toLowerCase();
  let firstDelimiters = ['/', ' ', ':'];
  let secondDelimiters = ['-', '_'];

  if (
    providerId &&
    ['aihubmix', 'silicon', 'ocoolai', 'o3', 'dmxapi'].includes(providerId.toLowerCase())
  ) {
    firstDelimiters = ['/', ' ', '-', '_', ':'];
    secondDelimiters = [];
  }

  for (const delimiter of firstDelimiters) {
    if (str.includes(delimiter)) {
      return str.split(delimiter)[0] ?? str;
    }
  }

  for (const delimiter of secondDelimiters) {
    if (str.includes(delimiter)) {
      const parts = str.split(delimiter);
      return parts.length > 1 ? `${parts[0]}-${parts[1]}` : (parts[0] ?? str);
    }
  }

  return str;
}

export function splitProviderModelIds(rawModelId: string): string[] {
  return rawModelId
    .replaceAll('，', ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isNewApiLikeProvider(provider: Provider | undefined): boolean {
  if (!provider) {
    return false;
  }

  return (
    gatewayProviderIds.includes(provider.id as (typeof gatewayProviderIds)[number]) ||
    provider.presetProviderId === 'new-api'
  );
}

export function buildProviderModelAddInputs({
  existingModels,
  formState,
  provider,
  providerId,
}: {
  existingModels: readonly Model[];
  formState: ProviderModelAddFormState;
  provider: Provider | undefined;
  providerId: string;
}): ProviderModelAddBuildResult {
  const modelIds = splitProviderModelIds(formState.modelId);
  const existingIds = new Set(existingModels.map((model) => model.id));
  const seenIds = new Set<UniqueModelId>();
  const duplicateIds: string[] = [];
  const inputs: CreateModelInput[] = [];
  const isBatch = modelIds.length > 1;
  const shouldIncludeEndpointTypes =
    isNewApiLikeProvider(provider) && formState.endpointTypes.length > 0;

  for (const modelId of modelIds) {
    const uniqueId = createUniqueModelId(providerId, modelId);
    if (existingIds.has(uniqueId) || seenIds.has(uniqueId)) {
      duplicateIds.push(modelId);
      continue;
    }

    seenIds.add(uniqueId);
    inputs.push(
      isBatch
        ? buildBatchProviderModelAddInput({
            endpointTypes: shouldIncludeEndpointTypes ? formState.endpointTypes : undefined,
            modelId,
            providerId,
          })
        : buildSingleProviderModelAddInput({
            endpointTypes: shouldIncludeEndpointTypes ? formState.endpointTypes : undefined,
            formState,
            modelId,
            providerId,
          }),
    );
  }

  return { duplicateIds, inputs };
}

function buildSingleProviderModelAddInput({
  endpointTypes,
  formState,
  modelId,
  providerId,
}: {
  endpointTypes: EndpointType[] | undefined;
  formState: ProviderModelAddFormState;
  modelId: string;
  providerId: string;
}): CreateModelInput {
  return removeUndefinedCreateModelFields({
    contextWindow: parseOptionalNumber(formState.contextWindow),
    endpointTypes: endpointTypes ? [...endpointTypes] : undefined,
    group: formState.group.trim() || getDefaultProviderModelGroupName(modelId),
    maxInputTokens: parseOptionalNumber(formState.maxInputTokens),
    maxOutputTokens: parseOptionalNumber(formState.maxOutputTokens),
    modelId,
    name: formState.name.trim() || modelId.toUpperCase(),
    providerId,
  });
}

function buildBatchProviderModelAddInput({
  endpointTypes,
  modelId,
  providerId,
}: {
  endpointTypes: EndpointType[] | undefined;
  modelId: string;
  providerId: string;
}): CreateModelInput {
  return removeUndefinedCreateModelFields({
    endpointTypes: endpointTypes ? [...endpointTypes] : undefined,
    group: getDefaultProviderModelGroupName(modelId),
    modelId,
    name: modelId,
    providerId,
  });
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function removeUndefinedCreateModelFields(input: CreateModelInput): CreateModelInput {
  return Object.fromEntries(
    Object.entries(input).filter((entry) => entry[1] !== undefined),
  ) as CreateModelInput;
}
