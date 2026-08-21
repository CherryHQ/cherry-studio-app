import { useMemo } from 'react';

import type { Model } from '@/shared/data/types/model';

import { getChatInputReasoningEffortsForModel } from '../utils/chatInputReasoning';

/**
 * Normalized effort levels supported by the model actually selected for this
 * chat. The caller owns model resolution because an assistant can override the
 * global default.
 */
export function useChatInputReasoningEfforts(model: Model | null | undefined) {
  return useMemo(() => getChatInputReasoningEffortsForModel(model), [model]);
}
