import {
  getNextModelSelection,
  MODEL_SETTING_KINDS,
  MODEL_SETTING_PREFERENCE_KEYS,
} from '../modelSettings';

describe('model settings helpers', () => {
  test('maps picker targets to model preference keys', () => {
    expect(MODEL_SETTING_KINDS).toEqual(['default', 'fast', 'translate', 'painting']);
    expect(MODEL_SETTING_PREFERENCE_KEYS).toEqual({
      default: 'agent.default_model_id',
      fast: 'feature.quick_assistant.model_id',
      painting: 'feature.paintings.default_model_id',
      translate: 'feature.translate.model_id',
    });
  });

  test('toggles the current model selection off', () => {
    expect(getNextModelSelection(null, 'openai::gpt-4o')).toBe('openai::gpt-4o');
    expect(getNextModelSelection('anthropic::claude-3-5-sonnet', 'openai::gpt-4o')).toBe(
      'openai::gpt-4o',
    );
    expect(getNextModelSelection('openai::gpt-4o', 'openai::gpt-4o')).toBeNull();
  });
});
