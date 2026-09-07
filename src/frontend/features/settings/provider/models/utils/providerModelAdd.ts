import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { type CreateModelDto, MODELS_BATCH_MAX_ITEMS } from '@/shared/data/api/schemas/models';
import {
  createUniqueModelId,
  type EndpointType,
  type Model,
  UniqueModelIdSchema,
} from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isImageGenerationModel } from '@/shared/utils/modelPurpose';
import {
  DEFAULT_MODEL_CONTEXT_WINDOW,
  DEFAULT_MODEL_MAX_OUTPUT_TOKENS,
} from '@/shared/utils/modelTokenLimits';

export type ProviderModelAddCapability = 'vision' | 'drawing';
export type ProviderModelAddEndpoint = 'auto' | EndpointType;
export type ProviderModelAddFormState = {
  capabilities: Partial<Record<ProviderModelAddCapability, boolean>>;
  contextWindow: string;
  endpointType: ProviderModelAddEndpoint;
  group: string;
  maxInputTokens: string;
  maxOutputTokens: string;
  modelId: string;
  name: string;
};

type NumberField = 'contextWindow' | 'maxInputTokens' | 'maxOutputTokens';
export type ProviderModelAddBuildResult = {
  duplicateIds: string[];
  invalidIds: string[];
  endpointErrorIds: string[];
  errors: Partial<Record<NumberField | 'modelId' | 'endpointType', string>>;
  inputs: CreateModelDto[];
};

export const PROVIDER_MODEL_CHAT_ENDPOINT_TYPES = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
] as const satisfies readonly EndpointType[];
export type ProviderModelChatEndpointType = (typeof PROVIDER_MODEL_CHAT_ENDPOINT_TYPES)[number];

export const providerModelAddEndpointOptions = [
  { id: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, labelKey: 'endpoint_type.openai' },
  { id: ENDPOINT_TYPE.OPENAI_RESPONSES, labelKey: 'endpoint_type.openai-response' },
  { id: ENDPOINT_TYPE.ANTHROPIC_MESSAGES, labelKey: 'endpoint_type.anthropic' },
  { id: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT, labelKey: 'endpoint_type.gemini' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, labelKey: 'endpoint_type.image-generation' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_EDIT, labelKey: 'endpoint_type.image-edit' },
] as const satisfies readonly { id: EndpointType; labelKey: string }[];

export function createInitialProviderModelAddFormState(): ProviderModelAddFormState {
  return {
    capabilities: {},
    contextWindow: '',
    endpointType: 'auto',
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
    if (str.includes(delimiter)) return str.split(delimiter)[0] ?? str;
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

export function isProviderModelAddIdValid(providerId: string, modelId: string): boolean {
  return UniqueModelIdSchema.safeParse(`${providerId}::${modelId}`).success;
}

export function getProviderChatEndpointTypes(
  provider: Pick<Provider, 'defaultChatEndpoint' | 'endpointConfigs'>,
): ProviderModelChatEndpointType[] {
  const endpointTypes: ProviderModelChatEndpointType[] = [];
  const defaultType = PROVIDER_MODEL_CHAT_ENDPOINT_TYPES.find(
    (type) => type === provider.defaultChatEndpoint,
  );
  if (defaultType && provider.endpointConfigs?.[defaultType]?.baseUrl?.trim())
    endpointTypes.push(defaultType);
  for (const type of PROVIDER_MODEL_CHAT_ENDPOINT_TYPES) {
    if (provider.endpointConfigs?.[type]?.baseUrl?.trim() && !endpointTypes.includes(type))
      endpointTypes.push(type);
  }
  return endpointTypes;
}

export function getProviderModelEndpointLabelKey(endpointType: EndpointType): string {
  return (
    providerModelAddEndpointOptions.find((option) => option.id === endpointType)?.labelKey ??
    endpointType
  );
}

export function isProviderModelImageEndpoint(
  endpointType: ProviderModelAddEndpoint | undefined,
): boolean {
  return (
    endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION ||
    endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT
  );
}

/** Only the existing OpenAI-compatible fallback may supply a generic image URL. */
export function getProviderModelAddEndpointOptions(provider: Provider) {
  return providerModelAddEndpointOptions.filter(({ id }) => {
    if (provider.endpointConfigs?.[id]?.baseUrl?.trim()) return true;
    const fallback = provider.defaultChatEndpoint;
    return (
      isProviderModelImageEndpoint(id) &&
      (fallback === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ||
        fallback === ENDPOINT_TYPE.OPENAI_RESPONSES) &&
      Boolean(provider.endpointConfigs?.[fallback]?.baseUrl?.trim())
    );
  });
}

export function getProviderModelAddCapabilities(
  form: ProviderModelAddFormState,
  baseline?: Model,
  isBatch = false,
) {
  return {
    vision: isBatch
      ? form.capabilities.vision === true
      : (form.capabilities.vision ??
        baseline?.capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION) ??
        false),
    drawing:
      isProviderModelImageEndpoint(form.endpointType) ||
      (!isBatch &&
        form.endpointType === 'auto' &&
        baseline?.endpointTypes?.some(isProviderModelImageEndpoint)) ||
      (isBatch
        ? form.capabilities.drawing === true
        : (form.capabilities.drawing ?? (baseline ? isImageGenerationModel(baseline) : false))),
  };
}

export function buildProviderModelAddInputs({
  existingModels,
  formState,
  provider,
  resolvedModels,
}: {
  existingModels: readonly Model[];
  formState: ProviderModelAddFormState;
  provider: Provider;
  resolvedModels: readonly Model[];
}): ProviderModelAddBuildResult {
  const result: ProviderModelAddBuildResult = {
    duplicateIds: [],
    invalidIds: [],
    endpointErrorIds: [],
    errors: {},
    inputs: [],
  };
  const modelIds = splitProviderModelIds(formState.modelId);
  const isBatch = modelIds.length > 1;
  const seenIds = new Set(existingModels.map((model) => model.id));
  const baselines = new Map(resolvedModels.map((model) => [model.modelId, model]));

  for (const modelId of modelIds) {
    if (!isProviderModelAddIdValid(provider.id, modelId)) {
      result.invalidIds.push(modelId);
      continue;
    }
    const id = createUniqueModelId(provider.id, modelId);
    if (seenIds.has(id)) {
      result.duplicateIds.push(modelId);
      continue;
    }
    seenIds.add(id);
    const baseline = baselines.get(modelId);
    const { fields, endpointError, drawing } = buildCapabilityFields(
      formState,
      provider,
      baseline,
      isBatch,
    );
    if (endpointError) {
      result.endpointErrorIds.push(modelId);
      result.errors.endpointType = endpointError;
    }
    const input: CreateModelDto = { modelId, providerId: provider.id, ...fields };
    // Omitting catalog metadata keeps it live; custom models retain useful local defaults.
    if (!isBatch && formState.name.trim()) input.name = formState.name.trim();
    if (!isBatch && formState.group.trim()) input.group = formState.group.trim();
    if (!baseline?.presetModelId) {
      input.name ??= modelId;
      input.group ??= getDefaultProviderModelGroupName(modelId, provider.id);
    }
    if (!isBatch && !drawing) {
      for (const field of ['contextWindow', 'maxInputTokens', 'maxOutputTokens'] as const) {
        const value = formState[field].trim();
        if (!value) continue;
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
          result.errors[field] = 'settings.provider.models.addPositiveInteger';
        } else input[field] = Number(value);
      }
      const context =
        input.contextWindow ?? baseline?.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;
      const output =
        input.maxOutputTokens ?? baseline?.maxOutputTokens ?? DEFAULT_MODEL_MAX_OUTPUT_TOKENS;
      const maxInput = input.maxInputTokens ?? baseline?.maxInputTokens;
      if (output >= context)
        result.errors.maxOutputTokens = 'settings.provider.models.addOutputLimitError';
      if (maxInput !== undefined && maxInput > context)
        result.errors.maxInputTokens = 'settings.provider.models.addInputLimitError';
    }
    result.inputs.push(input);
  }
  if (modelIds.length === 0) result.errors.modelId = 'settings.provider.models.addModelIdRequired';
  else if (result.invalidIds.length > 0)
    result.errors.modelId = 'settings.provider.models.addInvalidIds';
  else if (result.inputs.length > MODELS_BATCH_MAX_ITEMS)
    result.errors.modelId = 'settings.provider.models.addBatchLimit';
  return result;
}

function buildCapabilityFields(
  form: ProviderModelAddFormState,
  provider: Provider,
  baseline: Model | undefined,
  isBatch: boolean,
) {
  const fields: Pick<
    CreateModelDto,
    'capabilities' | 'endpointTypes' | 'inputModalities' | 'outputModalities'
  > = {};
  const visionOverride =
    isBatch && form.capabilities.vision !== true ? undefined : form.capabilities.vision;
  const drawingOverride =
    isBatch && form.capabilities.drawing !== true ? undefined : form.capabilities.drawing;
  const inheritedDrawing = baseline ? isImageGenerationModel(baseline) : false;
  const explicitEndpoint = form.endpointType === 'auto' ? undefined : form.endpointType;
  const endpoints = explicitEndpoint ? [explicitEndpoint] : baseline?.endpointTypes;
  const imageEndpoint = endpoints?.some(isProviderModelImageEndpoint) ?? false;
  const drawing = imageEndpoint || (drawingOverride ?? inheritedDrawing);
  const vision =
    visionOverride ?? baseline?.capabilities.includes(MODEL_CAPABILITY.IMAGE_RECOGNITION) ?? false;
  let endpointError: string | undefined;

  if (explicitEndpoint) fields.endpointTypes = [explicitEndpoint];
  if (drawingOverride === false && imageEndpoint)
    endpointError = 'settings.provider.models.addImageEndpointConflict';
  if (drawing && !imageEndpoint) {
    // Registered native image routes (including language protocols) remain owned by the catalog.
    const keepsNativeRoute =
      inheritedDrawing && (!explicitEndpoint || explicitEndpoint === baseline?.endpointTypes?.[0]);
    if (!keepsNativeRoute) {
      const fallback = getProviderModelAddEndpointOptions(provider).find(({ id }) =>
        isProviderModelImageEndpoint(id),
      );
      if (!explicitEndpoint && fallback) fields.endpointTypes = [fallback.id];
      else endpointError = 'settings.provider.models.addImageEndpointRequired';
    }
  }

  const capabilities = new Set(baseline?.capabilities ?? []);
  if (visionOverride !== undefined) {
    if (vision) capabilities.add(MODEL_CAPABILITY.IMAGE_RECOGNITION);
    else capabilities.delete(MODEL_CAPABILITY.IMAGE_RECOGNITION);
  }
  if (drawingOverride !== undefined || (explicitEndpoint && imageEndpoint)) {
    if (drawing) capabilities.add(MODEL_CAPABILITY.IMAGE_GENERATION);
    else capabilities.delete(MODEL_CAPABILITY.IMAGE_GENERATION);
  }
  if (
    capabilities.size !== baseline?.capabilities.length ||
    [...capabilities].some((capability) => !baseline?.capabilities.includes(capability))
  ) {
    if (baseline || capabilities.size > 0) fields.capabilities = [...capabilities];
  }

  const needsImageInput =
    vision || (fields.endpointTypes ?? endpoints)?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT);
  if (
    visionOverride !== undefined ||
    drawingOverride === false ||
    fields.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)
  ) {
    const modalities = new Set(baseline?.inputModalities ?? [MODALITY.TEXT]);
    if (needsImageInput) modalities.add(MODALITY.IMAGE);
    else if (!drawing) modalities.delete(MODALITY.IMAGE);
    if (modalities.size === 0) modalities.add(MODALITY.TEXT);
    fields.inputModalities = [...modalities];
  }
  if (drawingOverride !== undefined || (explicitEndpoint && imageEndpoint)) {
    const modalities = new Set(baseline?.outputModalities ?? []);
    if (drawing) modalities.add(MODALITY.IMAGE);
    else modalities.delete(MODALITY.IMAGE);
    if (modalities.size === 0) modalities.add(MODALITY.TEXT);
    fields.outputModalities = [...modalities];
  }
  return { fields, drawing, endpointError };
}
