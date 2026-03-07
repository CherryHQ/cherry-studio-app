/**
 * @fileoverview Callbacks factory for streaming message processing
 *
 * This module creates and composes all callback handlers used during
 * message streaming. Each callback type handles specific aspects:
 * - Base: session lifecycle, error handling, completion
 * - Text: main text block processing
 * - Thinking: thinking/reasoning block processing
 * - Tool: tool call/result processing
 * - Image: image generation processing
 * - Citation: web search/knowledge citations
 *
 * ARCHITECTURE NOTE:
 * These callbacks use StreamingService for state management.
 */

import type { Assistant } from '@/types/assistant'

import type { BlockManager } from '../BlockManager'
import { createBaseCallbacks } from './baseCallbacks'
import { createCitationCallbacks } from './citationCallbacks'
import { createImageCallbacks } from './imageCallbacks'
import { createTextCallbacks } from './textCallbacks'
import { createThinkingCallbacks } from './thinkingCallbacks'
import { createToolCallbacks } from './toolCallbacks'

/**
 * Dependencies required for creating all callbacks
 *
 * NOTE: Simplified design - StreamingService handles state management and persistence.
 */
interface CallbacksDependencies {
  blockManager: BlockManager
  topicId: string
  assistantMsgId: string
  assistant: Assistant
}

export const createCallbacks = (deps: CallbacksDependencies) => {
  const { blockManager, topicId, assistantMsgId, assistant } = deps

  // Create thinkingCallbacks first to pass getCurrentThinkingInfo to baseCallbacks
  const thinkingCallbacks = createThinkingCallbacks({
    blockManager,
    assistantMsgId
  })

  // Create base callbacks (lifecycle, error, complete)
  const baseCallbacks = createBaseCallbacks({
    blockManager,
    topicId,
    assistantMsgId,
    assistant,
    getCurrentThinkingInfo: thinkingCallbacks.getCurrentThinkingInfo
  })

  const toolCallbacks = createToolCallbacks({
    blockManager,
    assistantMsgId
  })

  const imageCallbacks = createImageCallbacks({
    blockManager,
    assistantMsgId
  })

  const citationCallbacks = createCitationCallbacks({
    blockManager,
    assistantMsgId
  })

  // Create textCallbacks with citation and tool citation handlers
  const textCallbacks = createTextCallbacks({
    blockManager,
    assistantMsgId,
    getCitationBlockId: citationCallbacks.getCitationBlockId,
    getCitationBlockIdFromTool: toolCallbacks.getCitationBlockId
  })

  // Compose all callbacks
  return {
    ...baseCallbacks,
    ...textCallbacks,
    ...thinkingCallbacks,
    ...toolCallbacks,
    ...imageCallbacks,
    ...citationCallbacks,
    cleanup: () => {
      // Cleanup is managed by messageThunk throttle functions
    }
  }
}
