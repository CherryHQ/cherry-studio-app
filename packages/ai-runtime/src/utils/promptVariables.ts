/**
 * User-system-prompt variable substitution.
 *
 * Ported from desktop's `src/main/utils/prompt.ts`. `{{username}}`/`{{language}}`
 * read through an injected preference port; `{{system}}`/`{{arch}}` come from
 * an injected platform environment.
 */

export interface PromptVariablePreferences {
  get(key: 'app.language' | 'app.user.name'): Promise<string | null | undefined>;
}

export interface PromptVariableEnvironment {
  architecture?: string;
  now?: () => Date;
  onPreferenceError?: (input: { error: unknown; key: 'app.language' | 'app.user.name' }) => void;
  system?: string;
}

export const VOLATILE_PROMPT_VARIABLES = ['{{time}}', '{{datetime}}'] as const;

const supportedVariables = [
  '{{username}}',
  '{{date}}',
  ...VOLATILE_PROMPT_VARIABLES,
  '{{system}}',
  '{{language}}',
  '{{arch}}',
  '{{model_name}}',
] as const;

export const containsSupportedVariables = (userSystemPrompt: string): boolean =>
  supportedVariables.some((variable) => userSystemPrompt.includes(variable));

export async function replacePromptVariables(
  userSystemPrompt: string,
  modelName: string | undefined,
  preference: PromptVariablePreferences,
  environment: PromptVariableEnvironment = {},
): Promise<string> {
  if (!containsSupportedVariables(userSystemPrompt)) {
    return userSystemPrompt;
  }

  let result = userSystemPrompt;
  const now = environment.now?.() ?? new Date();

  if (result.includes('{{date}}')) {
    const date = now.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    result = result.replace(/{{date}}/g, date);
  }

  if (result.includes('{{time}}')) {
    result = result.replace(/{{time}}/g, now.toLocaleTimeString());
  }

  if (result.includes('{{datetime}}')) {
    const datetime = now.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    result = result.replace(/{{datetime}}/g, datetime);
  }

  if (result.includes('{{username}}')) {
    try {
      const userName = (await preference.get('app.user.name')) || 'Unknown Username';
      result = result.replace(/{{username}}/g, userName);
    } catch (error) {
      reportPreferenceError(environment, 'app.user.name', error);
      result = result.replace(/{{username}}/g, 'Unknown Username');
    }
  }

  if (result.includes('{{system}}')) {
    result = result.replace(/{{system}}/g, environment.system || 'Unknown System');
  }

  if (result.includes('{{language}}')) {
    try {
      const language = (await preference.get('app.language')) ?? 'Unknown System Language';
      result = result.replace(/{{language}}/g, language);
    } catch (error) {
      reportPreferenceError(environment, 'app.language', error);
      result = result.replace(/{{language}}/g, 'Unknown System Language');
    }
  }

  if (result.includes('{{arch}}')) {
    result = result.replace(/{{arch}}/g, environment.architecture || 'Unknown Architecture');
  }

  if (result.includes('{{model_name}}')) {
    result = result.replace(/{{model_name}}/g, modelName ?? 'Unknown Model');
  }

  return result;
}

function reportPreferenceError(
  environment: PromptVariableEnvironment,
  key: 'app.language' | 'app.user.name',
  error: unknown,
): void {
  try {
    environment.onPreferenceError?.({ error, key });
  } catch {
    // Diagnostics must not prevent prompt fallback substitution.
  }
}
