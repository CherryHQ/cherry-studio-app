import {
  type Assistant,
  DEFAULT_ASSISTANT_ID,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@/data/types/assistant';
import type { UniqueModelId } from '@/data/types/model';
import i18n from '@/i18n';

const DEFAULT_ASSISTANT_TIMESTAMP = new Date(0).toISOString();

export function composeDefaultAssistant(modelId: UniqueModelId | null): Assistant {
  return {
    createdAt: DEFAULT_ASSISTANT_TIMESTAMP,
    description: '',
    emoji: '\u{1F600}',
    id: DEFAULT_ASSISTANT_ID,
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId,
    modelName: null,
    name: i18n.t('chat.default.name'),
    orderKey: '',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    tags: [],
    updatedAt: DEFAULT_ASSISTANT_TIMESTAMP,
  };
}
