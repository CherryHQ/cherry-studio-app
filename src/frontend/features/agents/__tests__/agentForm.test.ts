import type { Agent } from '@/shared/data/types/agent';

import { buildAgentDto, createAgentFormState } from '../agentForm';

const baseForm = createAgentFormState();

describe('createAgentFormState', () => {
  it('hydrates only the editable agent definition fields', () => {
    const state = createAgentFormState({
      avatar: 'agent-avatar-file:a.b.webp',
      avatarUri: 'file:///documents/agent-avatars/a.b.webp',
      instructions: 'sys',
      modelId: 'openai::gpt-5',
      name: 'Researcher',
      settings: { temperature: 0.4 },
      toolApprovalMode: 'auto',
    } as unknown as Agent);

    // Seeded from the resolved uri, not the stored reference: the draft is
    // compared against this to decide whether a file write is needed, and it is
    // also what the form renders.
    expect(state).toEqual({
      avatarUri: 'file:///documents/agent-avatars/a.b.webp',
      instructions: 'sys',
      modelId: 'openai::gpt-5',
      name: 'Researcher',
      toolApprovalMode: 'auto',
    });
  });

  it('starts a new agent with no avatar draft', () => {
    expect(createAgentFormState()).toMatchObject({
      avatarUri: null,
      toolApprovalMode: 'default',
    });
  });
});

describe('buildAgentDto', () => {
  it('requires a non-blank name', () => {
    expect(buildAgentDto({ ...baseForm, name: '  ' })).toEqual({
      errorKey: 'agent.form.nameRequired',
      ok: false,
    });
  });

  it('omits modelId when creation delegates default-model resolution to the backend', () => {
    const dto = buildAgentDto(
      { ...baseForm, modelId: 'openai::gpt-5', name: 'A' },
      { inheritDefaultModel: true },
    );

    if (!dto.ok) {
      throw new Error('expected ok');
    }

    expect(dto.value).not.toHaveProperty('modelId');
  });

  it('builds only the editable agent definition fields', () => {
    const dto = buildAgentDto({
      ...baseForm,
      // Present in the draft but never in the DTO: the create/update schemas are
      // strict, so leaking it would make the request fail outright.
      avatarUri: 'file:///picker/avatar.jpg',
      instructions: 'system prompt',
      modelId: 'openai::gpt-5',
      name: '  Researcher  ',
    });

    if (!dto.ok) {
      throw new Error('expected ok');
    }

    expect(dto.value).toEqual({
      instructions: 'system prompt',
      modelId: 'openai::gpt-5',
      name: 'Researcher',
      toolApprovalMode: 'default',
    });
  });
});
