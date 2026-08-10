import {
  containsSupportedVariables,
  replacePromptVariables as replacePortablePromptVariables,
  VOLATILE_PROMPT_VARIABLES,
} from '@cherrystudio/ai-runtime/utils';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('utils:promptVariables');

export { containsSupportedVariables, VOLATILE_PROMPT_VARIABLES };

export function replacePromptVariables(
  userSystemPrompt: string,
  modelName: string | undefined,
  preference: PreferenceService,
): Promise<string> {
  return replacePortablePromptVariables(userSystemPrompt, modelName, preference, {
    architecture: Device.supportedCpuArchitectures?.[0],
    system: Platform.OS,
    onPreferenceError: ({ error, key }) => {
      const variable = key === 'app.user.name' ? '{{username}}' : '{{language}}';
      logger.error(`Failed to resolve ${variable}`, error as Error);
    },
  });
}
