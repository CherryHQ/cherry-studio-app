import {
  CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
  configureBuiltinProviderInputSchema,
  CREATE_CUSTOM_PROVIDER_TOOL_NAME,
  createCustomProviderInputSchema,
  type ProviderConfigurationManualModel,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import { ENDPOINT_TYPE, type UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { normalizeCustomProviderBaseUrl } from '@cherrystudio/universal/data/types/provider';
import * as Crypto from 'expo-crypto';

import {
  type CustomProviderFormValue,
  isCustomProviderFormComplete,
} from '@/frontend/features/settings/providerConfiguration';
import type { ProviderSetupPreview } from '@/shared/contracts';

import type { PendingToolApproval } from '../runtime/chatRuntimeProjection';

export type ProviderConfigDraft =
  | {
      input: ReturnType<typeof configureBuiltinProviderInputSchema.parse>;
      kind: 'builtin';
    }
  | {
      input: ReturnType<typeof createCustomProviderInputSchema.parse>;
      kind: 'custom';
    };

export type ProviderConfigSetupStep = 'configuration' | 'models';

export const providerConfigSetupSteps: readonly ProviderConfigSetupStep[] = [
  'configuration',
  'models',
];

export function createProviderConfigDraft(
  approval: PendingToolApproval,
): ProviderConfigDraft | null {
  if (approval.toolName === CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME) {
    const parsed = configureBuiltinProviderInputSchema.safeParse(approval.input);
    return parsed.success ? { input: parsed.data, kind: 'builtin' } : null;
  }
  if (approval.toolName === CREATE_CUSTOM_PROVIDER_TOOL_NAME) {
    const parsed = createCustomProviderInputSchema.safeParse(approval.input);
    if (!parsed.success) return null;
    return {
      input: {
        ...parsed.data,
        baseUrl: normalizeCustomProviderBaseUrl(parsed.data.baseUrl),
        providerId: Crypto.randomUUID(),
      },
      kind: 'custom',
    };
  }
  return null;
}

export function customFormValueFromInput(
  input: Extract<ProviderConfigDraft, { kind: 'custom' }>['input'],
): CustomProviderFormValue {
  return {
    apiKey: input.apiKey,
    defaultChatEndpoint: input.defaultChatEndpoint,
    endpointUrls: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: input.baseUrl,
      [ENDPOINT_TYPE.OPENAI_RESPONSES]: input.openaiResponsesUrl,
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: input.anthropicUrl,
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: input.geminiUrl,
      [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION]: input.imageGenerationUrl,
      [ENDPOINT_TYPE.OPENAI_IMAGE_EDIT]: input.imageEditUrl,
    },
    name: input.name,
  };
}

export function customInputFromForm(
  input: Extract<ProviderConfigDraft, { kind: 'custom' }>['input'],
  value: CustomProviderFormValue,
): Extract<ProviderConfigDraft, { kind: 'custom' }>['input'] {
  const urls = value.endpointUrls;
  return {
    ...input,
    anthropicUrl: urls[ENDPOINT_TYPE.ANTHROPIC_MESSAGES] ?? '',
    apiKey: value.apiKey,
    baseUrl: urls[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS] ?? '',
    defaultChatEndpoint: value.defaultChatEndpoint,
    geminiUrl: urls[ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT] ?? '',
    imageEditUrl: urls[ENDPOINT_TYPE.OPENAI_IMAGE_EDIT] ?? '',
    imageGenerationUrl: urls[ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION] ?? '',
    name: value.name,
    openaiResponsesUrl: urls[ENDPOINT_TYPE.OPENAI_RESPONSES] ?? '',
  };
}

export function withModelSelections(
  draft: ProviderConfigDraft,
  selectedModelIds: ReadonlySet<UniqueModelId>,
  removedModelIds: ReadonlySet<UniqueModelId>,
  skipModelPull: boolean,
): ProviderConfigDraft {
  const selections = {
    removedModelIds: [...removedModelIds],
    selectedModelIds: [...selectedModelIds],
    skipModelPull,
  };
  return draft.kind === 'builtin'
    ? { ...draft, input: { ...draft.input, ...selections } }
    : { ...draft, input: { ...draft.input, ...selections } };
}

export function withManualModels(
  draft: ProviderConfigDraft,
  manualModels: ProviderConfigurationManualModel[],
): ProviderConfigDraft {
  return draft.kind === 'builtin'
    ? { ...draft, input: { ...draft.input, manualModels } }
    : { ...draft, input: { ...draft.input, manualModels } };
}

export function withModelPullEnabled(draft: ProviderConfigDraft): ProviderConfigDraft {
  return draft.kind === 'builtin'
    ? { ...draft, input: { ...draft.input, skipModelPull: false } }
    : { ...draft, input: { ...draft.input, skipModelPull: false } };
}

export function canContinueProviderConfig(
  step: ProviderConfigSetupStep,
  draft: ProviderConfigDraft,
  preview: ProviderSetupPreview | null,
): boolean {
  if (step === 'configuration') {
    return (
      draft.kind === 'builtin' ||
      isCustomProviderFormComplete(customFormValueFromInput(draft.input))
    );
  }
  return preview !== null;
}
