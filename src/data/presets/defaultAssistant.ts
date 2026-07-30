import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/domain/assistant';

export const DEFAULT_ASSISTANT_SEED = {
  description: '',
  emoji: '😀',
  modelId: null,
  name: 'Default Assistant',
  prompt: '',
  settings: DEFAULT_ASSISTANT_SETTINGS,
} as const;
