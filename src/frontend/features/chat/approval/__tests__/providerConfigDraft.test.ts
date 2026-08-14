import { ENDPOINT_TYPE, createUniqueModelId } from '@cherrystudio/universal/data/types/model';

import type { PendingToolApproval } from '../../runtime/chatRuntimeProjection';
import {
  createProviderConfigDraft,
  customFormValueFromInput,
  customInputFromForm,
  withModelSelections,
} from '../providerConfigDraft';

const generatedProviderId = '00000000-0000-4000-8000-000000000123';

describe('provider configuration draft', () => {
  test('replaces model-supplied custom ids and stores a normalized service root', () => {
    const draft = createProviderConfigDraft(customApproval(), () => generatedProviderId);

    expect(draft).toMatchObject({
      input: {
        baseUrl: 'https://api.example.com',
        providerId: generatedProviderId,
      },
      kind: 'custom',
    });
  });

  test('round-trips every custom endpoint through the editable form value', () => {
    const draft = createProviderConfigDraft(customApproval(), () => generatedProviderId);
    if (draft?.kind !== 'custom') throw new Error('Expected a custom provider draft');

    expect(customInputFromForm(draft.input, customFormValueFromInput(draft.input))).toEqual(
      draft.input,
    );
  });

  test('writes final model decisions without changing the rest of the approved input', () => {
    const draft = createProviderConfigDraft(builtinApproval());
    if (!draft) throw new Error('Expected a built-in provider draft');
    const selectedId = createUniqueModelId('cherryin', 'new-model');
    const removedId = createUniqueModelId('cherryin', 'old-model');

    expect(withModelSelections(draft, new Set([selectedId]), new Set([removedId]), true)).toEqual({
      ...draft,
      input: {
        ...draft.input,
        removedModelIds: [removedId],
        selectedModelIds: [selectedId],
        skipModelPull: true,
      },
    });
  });

  test('rejects approvals that do not match a provider configuration contract', () => {
    expect(
      createProviderConfigDraft({
        ...builtinApproval(),
        input: { provider: 'CherryIN' },
      }),
    ).toBeNull();
    expect(
      createProviderConfigDraft({
        ...builtinApproval(),
        toolName: 'other_tool',
      }),
    ).toBeNull();
  });
});

function builtinApproval(): PendingToolApproval {
  return {
    approvalId: 'approval-builtin',
    input: {
      apiKey: '',
      baseUrl: '',
      intent: 'configure',
      manualModels: [],
      provider: 'CherryIN',
      removedModelIds: [],
      selectedModelIds: [],
      skipModelPull: false,
    },
    messageId: 'assistant-1',
    toolCallId: 'call-builtin',
    toolName: 'configure_builtin_provider',
    toolType: 'provider',
  };
}

function customApproval(): PendingToolApproval {
  return {
    approvalId: 'approval-custom',
    input: {
      anthropicUrl: 'https://anthropic.example.com',
      apiKey: 'secret-key',
      baseUrl: 'https://api.example.com/v1',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      geminiUrl: 'https://gemini.example.com',
      imageEditUrl: 'https://images.example.com/edit',
      imageGenerationUrl: 'https://images.example.com/generate',
      intent: 'configure-and-models',
      manualModels: [],
      name: 'Example AI',
      openaiResponsesUrl: 'https://responses.example.com',
      providerId: 'model-supplied-id',
      removedModelIds: [],
      selectedModelIds: [],
      skipModelPull: false,
    },
    messageId: 'assistant-1',
    toolCallId: 'call-custom',
    toolName: 'create_custom_provider',
    toolType: 'provider',
  };
}
