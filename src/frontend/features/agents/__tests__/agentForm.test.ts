import type { Agent } from '@/shared/data/types/agent';

import { buildAgentDto, createAgentFormState } from '../agentForm';

const baseForm = createAgentFormState();

describe('createAgentFormState', () => {
  it('enables exactly the settings the stored agent carries', () => {
    const state = createAgentFormState({
      description: 'desc',
      instructions: 'sys',
      modelId: 'openai::gpt-5',
      name: 'Researcher',
      settings: { temperature: 0.4 },
    } as unknown as Agent);

    expect(state.enableTemperature).toBe(true);
    expect(state.temperature).toBe('0.4');
    expect(state.enableMaxOutputTokens).toBe(false);
    expect(state.enableReasoningEffort).toBe(false);
  });
});

describe('buildAgentDto', () => {
  it('requires a non-blank name', () => {
    expect(buildAgentDto({ ...baseForm, name: '  ' })).toEqual({
      errorKey: 'agent.form.nameRequired',
      ok: false,
    });
  });

  it('rejects out-of-range temperature and non-integer max output tokens', () => {
    expect(
      buildAgentDto({ ...baseForm, enableTemperature: true, name: 'A', temperature: '2.5' }),
    ).toEqual({ errorKey: 'agent.form.temperatureInvalid', ok: false });
    expect(
      buildAgentDto({
        ...baseForm,
        enableMaxOutputTokens: true,
        maxOutputTokens: '1.5',
        name: 'A',
      }),
    ).toEqual({ errorKey: 'agent.form.maxOutputTokensInvalid', ok: false });
  });

  it('rejects a blank enabled temperature instead of coercing it to zero', () => {
    expect(
      buildAgentDto({ ...baseForm, enableTemperature: true, name: 'A', temperature: '  ' }),
    ).toEqual({ errorKey: 'agent.form.temperatureInvalid', ok: false });
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

  it('emits disabled settings as physically present explicit-undefined keys', () => {
    const dto = buildAgentDto({
      ...baseForm,
      enableTemperature: true,
      name: 'A',
      temperature: '0.7',
    });

    if (!dto.ok) {
      throw new Error('expected ok');
    }

    expect(dto.value.settings).toEqual({
      maxOutputTokens: undefined,
      reasoningEffort: undefined,
      temperature: 0.7,
    });
    // The update endpoint clears a stored setting only when the key is present
    // in the patch, so omission here would silently keep stale values.
    expect(Object.keys(dto.value.settings ?? {})).toEqual([
      'maxOutputTokens',
      'reasoningEffort',
      'temperature',
    ]);
  });
});
