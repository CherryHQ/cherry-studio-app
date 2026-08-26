import type { Agent } from '@/shared/data/types/agent';

import { buildAgentDto, createAgentFormState } from '../agentForm';

const baseForm = createAgentFormState();

describe('createAgentFormState', () => {
  it('hydrates only the editable agent definition fields', () => {
    const state = createAgentFormState({
      instructions: 'sys',
      modelId: 'openai::gpt-5',
      name: 'Researcher',
      settings: { temperature: 0.4 },
    } as unknown as Agent);

    expect(state).toEqual({
      instructions: 'sys',
      modelId: 'openai::gpt-5',
      name: 'Researcher',
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
    });
  });
});
