import type { Agent } from '@/shared/data/types/agent';

import { buildAgentDto, createAgentFormState } from '../agentForm';

const baseForm = createAgentFormState();

describe('createAgentFormState', () => {
  it('hydrates only the editable agent definition fields', () => {
    const state = createAgentFormState({
      avatar: 'agent-avatar-file:a.b.webp',
      avatarUri: 'file:///documents/agent-avatars/a.b.webp',
      disabledCapabilities: ['reminders'],
      instructions: 'sys',
      mode: 'minimal',
      model: 'openai::gpt-5',
      name: 'Researcher',
      toolApprovalMode: 'default',
    } as unknown as Agent);

    // Seeded from the resolved uri, not the stored reference: the draft is
    // compared against this to decide whether a file write is needed, and it is
    // also what the form renders.
    expect(state).toEqual({
      avatarUri: 'file:///documents/agent-avatars/a.b.webp',
      instructions: 'sys',
      mode: 'minimal',
      model: 'openai::gpt-5',
      name: 'Researcher',
      toolApprovalMode: 'default',
    });
  });

  it('starts a new agent with no avatar draft and standard mode', () => {
    expect(createAgentFormState()).toMatchObject({
      avatarUri: null,
      mode: 'standard',
      toolApprovalMode: 'auto',
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

  it('omits model when creation delegates default-model resolution to the backend', () => {
    const dto = buildAgentDto(
      { ...baseForm, model: 'openai::gpt-5', name: 'A' },
      { inheritDefaultModel: true },
    );

    if (!dto.ok) {
      throw new Error('expected ok');
    }

    expect(dto.value).not.toHaveProperty('model');
  });

  it('builds only the editable agent definition fields', () => {
    const dto = buildAgentDto({
      ...baseForm,
      // Present in the draft but never in the DTO: the create/update schemas are
      // strict, so leaking it would make the request fail outright.
      avatarUri: 'file:///picker/avatar.jpg',
      instructions: 'system prompt',
      model: 'openai::gpt-5',
      name: '  Researcher  ',
    });

    if (!dto.ok) {
      throw new Error('expected ok');
    }

    expect(dto.value).toEqual({
      instructions: 'system prompt',
      mode: 'standard',
      model: 'openai::gpt-5',
      name: 'Researcher',
      toolApprovalMode: 'auto',
    });
  });

  it('keeps the approval preference when saving minimal mode', () => {
    const result = buildAgentDto({
      ...baseForm,
      name: 'Chat',
      mode: 'minimal',
      toolApprovalMode: 'default',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { mode: 'minimal', toolApprovalMode: 'default' },
    });
  });
});
