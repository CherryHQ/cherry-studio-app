import {
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  MODALITY,
  MODEL_CAPABILITY,
} from '@cherrystudio/provider-registry';

import type { CreateModelDto } from '@/shared/data/api/schemas/models';
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

import { buildModelPricing, type ModelPricingDraft } from './providerModelPricing';

export const providerModelCapabilityValues = {
  vision: MODEL_CAPABILITY.IMAGE_RECOGNITION,
  audio: MODEL_CAPABILITY.AUDIO_RECOGNITION,
  video: MODEL_CAPABILITY.VIDEO_RECOGNITION,
  reasoning: MODEL_CAPABILITY.REASONING,
  functionCall: MODEL_CAPABILITY.FUNCTION_CALL,
  drawing: MODEL_CAPABILITY.IMAGE_GENERATION,
  embedding: MODEL_CAPABILITY.EMBEDDING,
  rerank: MODEL_CAPABILITY.RERANK,
} as const;
export type ProviderModelAddCapability = keyof typeof providerModelCapabilityValues;
export type ProviderModelCapabilities = Record<ProviderModelAddCapability, boolean>;
export type ProviderModelPrimaryType = 'text' | 'image' | 'embedding' | 'rerank';
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
  primaryType?: ProviderModelPrimaryType;
  pricing?: ModelPricingDraft;
  supportsStreaming?: boolean;
};

type NumberField = 'contextWindow' | 'maxInputTokens' | 'maxOutputTokens';
export type ProviderModelAddBuildResult = {
  errors: Partial<Record<NumberField | 'modelId' | 'endpointType' | 'pricing', string>>;
  input?: CreateModelDto;
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
  { id: ENDPOINT_TYPE.OPENAI_EMBEDDINGS, labelKey: 'endpoint_type.openai-embeddings' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION, labelKey: 'endpoint_type.image-generation' },
  { id: ENDPOINT_TYPE.OPENAI_IMAGE_EDIT, labelKey: 'endpoint_type.image-edit' },
  { id: ENDPOINT_TYPE.JINA_RERANK, labelKey: 'endpoint_type.jina-rerank' },
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
    primaryType: undefined,
    pricing: undefined,
    supportsStreaming: undefined,
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

export function getProviderModelAddIdError(
  providerId: string,
  modelId: string,
): string | undefined {
  if (!modelId) return 'settings.provider.models.addModelIdRequired';
  if (/[,，\r\n]/.test(modelId)) return 'settings.provider.models.addSingleModelOnly';
  if (!UniqueModelIdSchema.safeParse(`${providerId}::${modelId}`).success) {
    return 'settings.provider.models.addInvalidId';
  }
  return undefined;
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

export function getProviderModelAddCapabilities(form: ProviderModelAddFormState, baseline?: Model) {
  const capabilities = Object.fromEntries(
    Object.entries(providerModelCapabilityValues).map(([key, value]) => [
      key,
      form.capabilities[key as ProviderModelAddCapability] ??
        (baseline?.capabilities.includes(value) ||
          (key === 'vision' && baseline?.inputModalities?.includes(MODALITY.IMAGE)) ||
          (key === 'audio' && baseline?.inputModalities?.includes(MODALITY.AUDIO)) ||
          (key === 'video' && baseline?.inputModalities?.includes(MODALITY.VIDEO)) ||
          false),
    ]),
  ) as ProviderModelCapabilities;
  return {
    ...capabilities,
    drawing: Boolean(
      isProviderModelImageEndpoint(form.endpointType) ||
      (form.endpointType === 'auto' &&
        baseline?.endpointTypes?.some(isProviderModelImageEndpoint)) ||
      (form.capabilities.drawing ?? (baseline ? isImageGenerationModel(baseline) : false)),
    ),
  };
}

export function getProviderModelPrimaryType(
  capabilities: ProviderModelCapabilities,
  baseline?: Model,
): ProviderModelPrimaryType | null {
  if (capabilities.rerank) return 'rerank';
  if (capabilities.embedding) return 'embedding';
  if (capabilities.drawing) return 'image';
  if (
    baseline?.capabilities.some(
      (capability) =>
        capability === MODEL_CAPABILITY.AUDIO_GENERATION ||
        capability === MODEL_CAPABILITY.VIDEO_GENERATION ||
        capability === MODEL_CAPABILITY.AUDIO_TRANSCRIPT,
    )
  )
    return null;
  return 'text';
}

export function changeProviderModelPrimaryType(
  form: ProviderModelAddFormState,
  type: ProviderModelPrimaryType,
  provider: Provider,
  baseline?: Model,
): ProviderModelAddFormState {
  if (
    (form.primaryType ??
      getProviderModelPrimaryType(getProviderModelAddCapabilities(form, baseline), baseline)) ===
    type
  )
    return form;
  const inherited = getProviderModelAddCapabilities(
    createInitialProviderModelAddFormState(),
    baseline,
  );
  const inheritedType = getProviderModelPrimaryType(inherited, baseline);
  const capabilities = { ...form.capabilities };
  for (const [key, selected] of [
    ['drawing', type === 'image'],
    ['embedding', type === 'embedding'],
    ['rerank', type === 'rerank'],
  ] as const) {
    if (selected === inherited[key]) delete capabilities[key];
    else capabilities[key] = selected;
  }
  const endpoints = form.endpointType === 'auto' ? baseline?.endpointTypes : [form.endpointType];
  let endpointType = form.endpointType;
  if (
    type !== 'image' &&
    endpoints?.some((endpoint) => endpointImpliedCapability(endpoint) != null)
  ) {
    endpointType = getProviderChatEndpointTypes(provider)[0] ?? 'auto';
  }
  if (type === 'embedding') endpointType = ENDPOINT_TYPE.OPENAI_EMBEDDINGS;
  else if (type === 'rerank') endpointType = ENDPOINT_TYPE.JINA_RERANK;
  else if (
    endpointType === ENDPOINT_TYPE.OPENAI_EMBEDDINGS ||
    endpointType === ENDPOINT_TYPE.JINA_RERANK
  ) {
    endpointType = getProviderChatEndpointTypes(provider)[0] ?? 'auto';
  }
  if (
    type === 'image' &&
    !endpoints?.some(isProviderModelImageEndpoint) &&
    !(baseline && isImageGenerationModel(baseline))
  ) {
    endpointType =
      getProviderModelAddEndpointOptions(provider).find(({ id }) =>
        isProviderModelImageEndpoint(id),
      )?.id ?? 'auto';
  }
  if (type === inheritedType) endpointType = baseline?.endpointTypes?.[0] ?? 'auto';
  return {
    ...form,
    capabilities,
    endpointType,
    primaryType: type === inheritedType ? undefined : type,
  };
}

export function changeProviderModelEndpoint(
  form: ProviderModelAddFormState,
  endpointType: ProviderModelAddEndpoint,
  baseline?: Model,
): ProviderModelAddFormState {
  const capabilities = { ...form.capabilities };
  const inherited = getProviderModelAddCapabilities(
    createInitialProviderModelAddFormState(),
    baseline,
  );
  let primaryType = form.primaryType;
  if (isProviderModelImageEndpoint(endpointType)) {
    delete capabilities.drawing;
    if (inherited.embedding) capabilities.embedding = false;
    else delete capabilities.embedding;
    if (inherited.rerank) capabilities.rerank = false;
    else delete capabilities.rerank;
    primaryType = undefined;
  } else if (
    endpointType === ENDPOINT_TYPE.OPENAI_EMBEDDINGS ||
    endpointType === ENDPOINT_TYPE.JINA_RERANK
  ) {
    capabilities.drawing = false;
    capabilities.embedding = endpointType === ENDPOINT_TYPE.OPENAI_EMBEDDINGS;
    capabilities.rerank = endpointType === ENDPOINT_TYPE.JINA_RERANK;
    primaryType = capabilities.embedding ? 'embedding' : 'rerank';
  }
  return { ...form, capabilities, endpointType, primaryType };
}

export function buildProviderModelAddInput({
  existingModels,
  formState,
  provider,
  baseline,
}: {
  existingModels: readonly Model[];
  formState: ProviderModelAddFormState;
  provider: Provider;
  baseline?: Model;
}): ProviderModelAddBuildResult {
  const errors: ProviderModelAddBuildResult['errors'] = {};
  const modelId = formState.modelId.trim();
  const modelIdError = getProviderModelAddIdError(provider.id, modelId);
  if (modelIdError) return { errors: { modelId: modelIdError } };
  const id = createUniqueModelId(provider.id, modelId);
  if (existingModels.some((model) => model.id === id)) {
    return { errors: { modelId: 'settings.provider.models.addDuplicate' } };
  }

  const { fields, endpointError, drawing } = buildProviderModelCapabilityFields(
    formState,
    provider,
    baseline,
  );
  if (endpointError) errors.endpointType = endpointError;
  const input: CreateModelDto = { modelId, providerId: provider.id, ...fields };
  // Omitting catalog metadata keeps it live; custom models retain useful local defaults.
  if (formState.name.trim()) input.name = formState.name.trim();
  if (formState.group.trim()) input.group = formState.group.trim();
  if (formState.supportsStreaming !== undefined)
    input.supportsStreaming = formState.supportsStreaming;
  if (formState.pricing) {
    const pricingResult = buildModelPricing(formState.pricing, baseline?.pricing);
    if (!pricingResult.pricing) errors.pricing = 'settings.provider.models.pricing.invalidFields';
    else input.pricing = pricingResult.pricing;
  }
  if (!baseline?.presetModelId) {
    input.name ??= modelId;
    input.group ??= getDefaultProviderModelGroupName(modelId, provider.id);
  }
  if (!drawing) {
    for (const field of ['contextWindow', 'maxInputTokens', 'maxOutputTokens'] as const) {
      const value = formState[field].trim();
      if (!value) continue;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
        errors[field] = 'settings.provider.models.addPositiveInteger';
      } else input[field] = Number(value);
    }
    const context = input.contextWindow ?? baseline?.contextWindow ?? DEFAULT_MODEL_CONTEXT_WINDOW;
    const output =
      input.maxOutputTokens ?? baseline?.maxOutputTokens ?? DEFAULT_MODEL_MAX_OUTPUT_TOKENS;
    const maxInput = input.maxInputTokens ?? baseline?.maxInputTokens;
    if (
      getProviderModelPrimaryType(
        getProviderModelAddCapabilities(formState, baseline),
        baseline,
      ) === 'text'
    ) {
      if (output >= context)
        errors.maxOutputTokens = 'settings.provider.models.addOutputLimitError';
      if (maxInput !== undefined && maxInput > context)
        errors.maxInputTokens = 'settings.provider.models.addInputLimitError';
    }
  }
  return Object.keys(errors).length > 0 ? { errors } : { errors, input };
}

export function buildProviderModelCapabilityFields(
  form: ProviderModelAddFormState,
  provider: Provider,
  baseline: Model | undefined,
) {
  const fields: Pick<
    CreateModelDto,
    'capabilities' | 'endpointTypes' | 'inputModalities' | 'outputModalities'
  > = {};
  const visionOverride = form.capabilities.vision;
  const drawingOverride = form.capabilities.drawing;
  const inheritedDrawing = baseline ? isImageGenerationModel(baseline) : false;
  const explicitEndpoint = form.endpointType === 'auto' ? undefined : form.endpointType;
  const endpoints = explicitEndpoint ? [explicitEndpoint] : baseline?.endpointTypes;
  const imageEndpoint = endpoints?.some(isProviderModelImageEndpoint) ?? false;
  const drawing = imageEndpoint || (drawingOverride ?? inheritedDrawing);
  const vision = getProviderModelAddCapabilities(form, baseline).vision;
  let endpointError: string | undefined;

  if (explicitEndpoint) fields.endpointTypes = [explicitEndpoint];
  if (
    form.primaryType === 'text' &&
    endpoints?.some((endpoint) => endpointImpliedCapability(endpoint) != null)
  ) {
    endpointError = 'settings.provider.models.classification.textEndpointRequired';
  }
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
  if (form.primaryType !== undefined) {
    for (const capability of [
      MODEL_CAPABILITY.AUDIO_GENERATION,
      MODEL_CAPABILITY.VIDEO_GENERATION,
      MODEL_CAPABILITY.AUDIO_TRANSCRIPT,
    ])
      capabilities.delete(capability);
  }
  for (const key of [
    'reasoning',
    'functionCall',
    'audio',
    'video',
    'embedding',
    'rerank',
  ] as const) {
    if (form.capabilities[key] === true) capabilities.add(providerModelCapabilityValues[key]);
    else if (form.capabilities[key] === false)
      capabilities.delete(providerModelCapabilityValues[key]);
  }
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
  const inheritedInputModalities = new Set(baseline?.inputModalities ?? [MODALITY.TEXT]);
  for (const [key, modality] of [
    ['vision', MODALITY.IMAGE],
    ['audio', MODALITY.AUDIO],
    ['video', MODALITY.VIDEO],
  ] as const) {
    if (baseline?.capabilities.includes(providerModelCapabilityValues[key]))
      inheritedInputModalities.add(modality);
  }
  if (
    visionOverride !== undefined ||
    drawingOverride === false ||
    fields.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)
  ) {
    const modalities = new Set(inheritedInputModalities);
    if (needsImageInput) modalities.add(MODALITY.IMAGE);
    else modalities.delete(MODALITY.IMAGE);
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
  for (const [key, modality] of [
    ['audio', MODALITY.AUDIO],
    ['video', MODALITY.VIDEO],
  ] as const) {
    const override = form.capabilities[key];
    if (override === undefined) continue;
    const modalities = new Set(fields.inputModalities ?? inheritedInputModalities);
    if (override) modalities.add(modality);
    else modalities.delete(modality);
    fields.inputModalities = [...modalities];
  }
  if (
    form.primaryType !== undefined &&
    baseline?.capabilities.some(
      (capability) =>
        capability === MODEL_CAPABILITY.AUDIO_GENERATION ||
        capability === MODEL_CAPABILITY.VIDEO_GENERATION ||
        capability === MODEL_CAPABILITY.AUDIO_TRANSCRIPT,
    )
  ) {
    fields.inputModalities = [
      ...new Set([MODALITY.TEXT, ...(fields.inputModalities ?? inheritedInputModalities)]),
    ];
    fields.outputModalities = drawing ? [MODALITY.IMAGE] : [MODALITY.TEXT];
  }
  return { fields, drawing, endpointError };
}
