import { DEFAULT_ASSISTANT_SETTINGS } from '@cherrystudio/universal/data/types/assistant';

import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from './cherryai';

export const DEFAULT_ASSISTANT_NAME = 'Cherry Assistant' as const;
export const DEFAULT_ASSISTANT_EMOJI = '😀' as const;
export const DEFAULT_ASSISTANT_PROMPT = '' as const;

export function getDefaultAssistantNameForLocale(locale?: string | null): string {
  return locale?.toLowerCase().startsWith('zh') ? 'Cherry 助手' : DEFAULT_ASSISTANT_NAME;
}

export const DEFAULT_ASSISTANT_SEED = {
  description: '',
  emoji: DEFAULT_ASSISTANT_EMOJI,
  modelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
  name: DEFAULT_ASSISTANT_NAME,
  prompt: DEFAULT_ASSISTANT_PROMPT,
  settings: DEFAULT_ASSISTANT_SETTINGS,
} as const;
