import {
  containsSupportedVariables,
  type PromptVariablePreferences,
  replacePromptVariables as replacePromptVariablesWithEnvironment,
} from '../promptVariables';

function createPreference(values: Partial<Record<string, string>> = {}): PromptVariablePreferences {
  return {
    get: vi.fn(async (key) => values[key]),
  };
}

const replacePromptVariables = (
  prompt: string,
  modelName: string | undefined,
  preference: PromptVariablePreferences,
) =>
  replacePromptVariablesWithEnvironment(prompt, modelName, preference, {
    architecture: 'arm64 v8',
    system: 'ios',
  });

describe('containsSupportedVariables', () => {
  it('detects a supported variable', () => {
    expect(containsSupportedVariables('Today is {{date}}.')).toBe(true);
  });

  it('returns false when no variable is present', () => {
    expect(containsSupportedVariables('You are a helpful assistant.')).toBe(false);
  });
});

describe('replacePromptVariables', () => {
  it('returns the prompt unchanged when it has no variables (no preference lookups)', async () => {
    const preference = createPreference();
    const result = await replacePromptVariables(
      'You are a helpful assistant.',
      'gpt-5',
      preference,
    );
    expect(result).toBe('You are a helpful assistant.');
    expect(preference.get).not.toHaveBeenCalled();
  });

  it('substitutes {{username}} from the preference service', async () => {
    const preference = createPreference({ 'app.user.name': 'Ada' });
    expect(await replacePromptVariables('Hi {{username}}', undefined, preference)).toBe('Hi Ada');
  });

  it('falls back to a default when {{username}} is empty', async () => {
    const preference = createPreference({ 'app.user.name': '' });
    expect(await replacePromptVariables('Hi {{username}}', undefined, preference)).toBe(
      'Hi Unknown Username',
    );
  });

  it('substitutes {{language}} from the preference service', async () => {
    const preference = createPreference({ 'app.language': 'zh-CN' });
    expect(await replacePromptVariables('lang={{language}}', undefined, preference)).toBe(
      'lang=zh-CN',
    );
  });

  it('substitutes {{model_name}}', async () => {
    const preference = createPreference();
    expect(await replacePromptVariables('model={{model_name}}', 'gpt-5', preference)).toBe(
      'model=gpt-5',
    );
  });

  it('falls back to a default when {{model_name}} has no model', async () => {
    const preference = createPreference();
    expect(await replacePromptVariables('model={{model_name}}', undefined, preference)).toBe(
      'model=Unknown Model',
    );
  });

  it('substitutes {{system}} with the RN platform', async () => {
    const preference = createPreference();
    expect(await replacePromptVariables('os={{system}}', undefined, preference)).toBe('os=ios');
  });

  it('substitutes {{arch}} with the first supported CPU architecture', async () => {
    const preference = createPreference();
    expect(await replacePromptVariables('arch={{arch}}', undefined, preference)).toBe(
      'arch=arm64 v8',
    );
  });

  it('substitutes {{date}}/{{time}}/{{datetime}} without touching the preference service', async () => {
    const preference = createPreference();
    const result = await replacePromptVariables(
      '{{date}} {{time}} {{datetime}}',
      undefined,
      preference,
    );
    expect(result).not.toContain('{{');
    expect(preference.get).not.toHaveBeenCalled();
  });

  it('substitutes every occurrence of a repeated variable', async () => {
    const preference = createPreference({ 'app.user.name': 'Ada' });
    expect(await replacePromptVariables('{{username}}-{{username}}', undefined, preference)).toBe(
      'Ada-Ada',
    );
  });

  it('reports preference failures and keeps fallback substitution isolated', async () => {
    const onPreferenceError = vi.fn(() => {
      throw new Error('diagnostics unavailable');
    });
    const preference: PromptVariablePreferences = {
      get: vi.fn(async () => {
        throw new Error('preference unavailable');
      }),
    };

    await expect(
      replacePromptVariablesWithEnvironment('{{username}} / {{language}}', undefined, preference, {
        onPreferenceError,
      }),
    ).resolves.toBe('Unknown Username / Unknown System Language');
    expect(onPreferenceError).toHaveBeenCalledTimes(2);
  });
});
