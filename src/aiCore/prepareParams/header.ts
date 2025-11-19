import { isClaude45ReasoningModel } from '@/config/models'
import type { Assistant, Model } from '@/types/assistant'
import { isToolUseModeFunction } from '@/utils/assistants'

const INTERLEAVED_THINKING_HEADER = 'interleaved-thinking-2025-05-14'

export function addAnthropicHeaders(assistant: Assistant, model: Model): string[] {
  const anthropicHeaders: string[] = []
  if (isClaude45ReasoningModel(model) && isToolUseModeFunction(assistant)) {
    anthropicHeaders.push(INTERLEAVED_THINKING_HEADER)
  }
  return anthropicHeaders
}
