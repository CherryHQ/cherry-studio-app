/**
 * User-system-prompt variable substitution.
 *
 * Ported from desktop's `src/main/utils/prompt.ts`. `{{username}}`/`{{language}}`
 * read from mobile's `PreferenceService` instead of Electron's; `{{system}}`/
 * `{{arch}}` use React Native/Expo equivalents of Node's `os.platform()`/`os.arch()`.
 */

import { loggerService } from '@logger';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type { PreferenceService } from '@/backend/infrastructure/services/PreferenceService';

const logger = loggerService.withContext('utils:promptVariables');

const supportedVariables = [
  '{{username}}',
  '{{date}}',
  '{{time}}',
  '{{datetime}}',
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
  preference: PreferenceService,
): Promise<string> {
  if (!containsSupportedVariables(userSystemPrompt)) {
    return userSystemPrompt;
  }

  let result = userSystemPrompt;
  const now = new Date();

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
      logger.error('Failed to resolve {{username}}', error as Error);
      result = result.replace(/{{username}}/g, 'Unknown Username');
    }
  }

  if (result.includes('{{system}}')) {
    result = result.replace(/{{system}}/g, Platform.OS || 'Unknown System');
  }

  if (result.includes('{{language}}')) {
    try {
      const language = (await preference.get('app.language')) ?? 'Unknown System Language';
      result = result.replace(/{{language}}/g, language);
    } catch (error) {
      logger.error('Failed to resolve {{language}}', error as Error);
      result = result.replace(/{{language}}/g, 'Unknown System Language');
    }
  }

  if (result.includes('{{arch}}')) {
    const arch = Device.supportedCpuArchitectures?.[0];
    result = result.replace(/{{arch}}/g, arch || 'Unknown Architecture');
  }

  if (result.includes('{{model_name}}')) {
    result = result.replace(/{{model_name}}/g, modelName ?? 'Unknown Model');
  }

  return result;
}
