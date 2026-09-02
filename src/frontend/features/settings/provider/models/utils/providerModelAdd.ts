import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { CreateModelDto } from '@/shared/data/api/schemas/models';
import {
  createUniqueModelId,
  type EndpointType,
  type Model,
  type UniqueModelId,
} from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

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
  inputs: CreateModelDto[];
};

export type ProviderModelAddMode = 'endpoint-types' | 'legacy' | 'purpose';
export type ProviderModelPurpose = 'chat' | 'image-edit' | 'image-generation';

export const PROVIDER_MODEL_PURPOSE_OPTIONS = [
  { id: 'chat', labelKey: 'settings.provider.models.addPurpose.chat' },
  {
    id: 'image-generation',
    labelKey: 'settings.provider.models.addPurpose.imageGeneration',
  },
  { id: 'image-edit', labelKey: 'settings.provider.models.addPurpose.imageEdit' },
] as const satisfies readonly { id: ProviderModelPurpose; labelKey: string }[];

export const PROVIDER_MODEL_CHAT_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
] as const satisfies readonly EndpointType[];

export type ProviderModelChatEndpointType = (typeof PROVIDER_MODEL_CHAT_ENDPOINT_TYPES)[number];

export const providerModelAddDefaultEndpointType = ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;

export const providerModelAddEndpointOptions = [
  { id: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, labelKey: 'endpoint_type.openai' },
  { id: ENDPOINT_TYPE.OPENAI_RESPONSES, labelKey: 'endpoint_type.openai-response' },
  { id: ENDPOINT_TYPE.ANTHROPIC_MESSAGES, labelKey: 'endpoint_type.anthropic' },
  { id: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, labelKey: 'endpoint_type.gemini' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, labelKey: 'endpoint_type.image-generation' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_EDIT, labelKey: 'endpoint_type.image-edit' },
] as const satisfies readonly { id: EndpointType; labelKey: string }[];

const GATEWAY_PROVIDER_IDS = ['new-api', 'newapi', 'cherryin', 'aionly'] as const;

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
    GATEWAY_PROVIDER_IDS.includes(provider.id as (typeof GATEWAY_PROVIDER_IDS)[number]) ||
    GATEWAY_PROVIDER_IDS.includes(
      provider.presetProviderId as (typeof GATEWAY_PROVIDER_IDS)[number],
    )
  );
}

export function getProviderModelAddMode(provider: Provider | undefined): ProviderModelAddMode {
  if (!provider) {
    return 'legacy';
  }
  if (isNewApiLikeProvider(provider)) {
    return 'endpoint-types';
  }
  return provider.presetProviderId == null ? 'purpose' : 'legacy';
}

export function getProviderChatEndpointTypes(
  provider: Pick<Provider, 'defaultChatEndpoint' | 'endpointConfigs'>,
): ProviderModelChatEndpointType[] {
  const endpointTypes: ProviderModelChatEndpointType[] = [];

  if (isProviderModelChatEndpointType(provider.defaultChatEndpoint)) {
    endpointTypes.push(provider.defaultChatEndpoint);
  }

  for (const endpointType of Object.keys(provider.endpointConfigs ?? {})) {
    if (isProviderModelChatEndpointType(endpointType) && !endpointTypes.includes(endpointType)) {
      endpointTypes.push(endpointType);
    }
  }

  return endpointTypes;
}

export function inferProviderModelPurpose(
  endpointTypes: readonly EndpointType[],
): ProviderModelPurpose {
  if (endpointTypes[0] === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT) {
    return 'image-edit';
  }
  if (endpointTypes[0] === ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION) {
    return 'image-generation';
  }
  return 'chat';
}

export function getProviderModelEndpointLabelKey(endpointType: EndpointType): string {
  return (
    providerModelAddEndpointOptions.find((option) => option.id === endpointType)?.labelKey ??
    endpointType
  );
}

export function getProviderModelPurposeEndpointType(
  purpose: ProviderModelPurpose,
  chatEndpointType: ProviderModelChatEndpointType,
): EndpointType {
  if (purpose === 'image-edit') {
    return ENDPOINT_TYPE.OPENAI_IMAGE_EDIT;
  }
  if (purpose === 'image-generation') {
    return ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION;
  }
  return chatEndpointType;
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
  const inputs: CreateModelDto[] = [];
  const isBatch = modelIds.length > 1;
  const modelFields = buildProviderModelAddFields(provider, formState);

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
            modelFields,
            modelId,
            providerId,
          })
        : buildSingleProviderModelAddInput({
            formState,
            modelFields,
            modelId,
            providerId,
          }),
    );
  }

  return { duplicateIds, inputs };
}

function buildSingleProviderModelAddInput({
  formState,
  modelFields,
  modelId,
  providerId,
}: {
  formState: ProviderModelAddFormState;
  modelFields: ProviderModelAddFields;
  modelId: string;
  providerId: string;
}): CreateModelDto {
  return removeUndefinedCreateModelFields({
    contextWindow: parseOptionalNumber(formState.contextWindow),
    group: formState.group.trim() || getDefaultProviderModelGroupName(modelId),
    maxInputTokens: parseOptionalNumber(formState.maxInputTokens),
    maxOutputTokens: parseOptionalNumber(formState.maxOutputTokens),
    ...modelFields,
    modelId,
    name: formState.name.trim() || modelId.toUpperCase(),
    providerId,
  });
}

function buildBatchProviderModelAddInput({
  modelFields,
  modelId,
  providerId,
}: {
  modelFields: ProviderModelAddFields;
  modelId: string;
  providerId: string;
}): CreateModelDto {
  return removeUndefinedCreateModelFields({
    group: getDefaultProviderModelGroupName(modelId),
    ...modelFields,
    modelId,
    name: modelId,
    providerId,
  });
}

type ProviderModelAddFields = Pick<
  CreateModelDto,
  'capabilities' | 'endpointTypes' | 'inputModalities' | 'outputModalities'
>;

function buildProviderModelAddFields(
  provider: Provider | undefined,
  formState: ProviderModelAddFormState,
): ProviderModelAddFields {
  const mode = getProviderModelAddMode(provider);
  if (mode === 'legacy') {
    return {};
  }

  const fallbackChatEndpoint = provider
    ? (getProviderChatEndpointTypes(provider)[0] ?? providerModelAddDefaultEndpointType)
    : providerModelAddDefaultEndpointType;
  const primaryEndpoint = formState.endpointTypes[0] ?? fallbackChatEndpoint;
  const endpointTypes =
    mode === 'purpose'
      ? [primaryEndpoint]
      : formState.endpointTypes.length
        ? [...formState.endpointTypes]
        : [fallbackChatEndpoint];

  if (endpointTypes[0] === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT) {
    return {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes,
      inputModalities: [MODALITY.IMAGE],
      outputModalities: [MODALITY.IMAGE],
    };
  }
  if (endpointTypes[0] === ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION) {
    return {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes,
      outputModalities: [MODALITY.IMAGE],
    };
  }
  return { endpointTypes };
}

function isProviderModelChatEndpointType(
  endpointType: string | undefined,
): endpointType is ProviderModelChatEndpointType {
  return PROVIDER_MODEL_CHAT_ENDPOINT_TYPES.some((candidate) => candidate === endpointType);
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function removeUndefinedCreateModelFields(input: CreateModelDto): CreateModelDto {
  return Object.fromEntries(
    Object.entries(input).filter((entry) => entry[1] !== undefined),
  ) as CreateModelDto;
}
