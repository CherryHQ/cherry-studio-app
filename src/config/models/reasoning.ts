import { Model, ReasoningEffortOptions } from '@/types/assistant'
import { getLowerBaseModelName } from '@/utils/naming'

import { isEmbeddingModel } from './embedding'
export const REASONING_REGEX =
  /^(o\d+(?:-[\w-]+)?|.*\b(?:reasoning|reasoner|thinking)\b.*|.*-[rR]\d+.*|.*\bqwq(?:-[\w-]+)?\b.*|.*\bhunyuan-t1(?:-[\w-]+)?\b.*|.*\bglm-zero-preview\b.*|.*\bgrok-3-mini(?:-[\w-]+)?\b.*)$/i

export function isClaudeReasoningModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  return (
    model.id.includes('claude-3-7-sonnet') ||
    model.id.includes('claude-3.7-sonnet') ||
    model.id.includes('claude-sonnet-4') ||
    model.id.includes('claude-opus-4')
  )
}

export function isOpenAIReasoningModel(model: Model): boolean {
  return model.id.includes('o1') || model.id.includes('o3') || model.id.includes('o4')
}

export function isGeminiReasoningModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  if (model.id.startsWith('gemini') && model.id.includes('thinking')) {
    return true
  }

  if (isSupportedThinkingTokenGeminiModel(model)) {
    return true
  }

  return false
}

export function isQwenReasoningModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  if (isSupportedThinkingTokenQwenModel(model)) {
    return true
  }

  if (model.id.includes('qwq') || model.id.includes('qvq')) {
    return true
  }

  return false
}

export function isSupportedThinkingTokenQwenModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  const baseName = getLowerBaseModelName(model.id, '/')

  return (
    baseName.startsWith('qwen3') ||
    [
      'qwen-plus',
      'qwen-plus-latest',
      'qwen-plus-0428',
      'qwen-plus-2025-04-28',
      'qwen-turbo',
      'qwen-turbo-latest',
      'qwen-turbo-0428',
      'qwen-turbo-2025-04-28'
    ].includes(baseName)
  )
}

export function isGrokReasoningModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  if (isSupportedReasoningEffortGrokModel(model) || model.id.includes('grok-4')) {
    return true
  }

  return false
}

export function isSupportedReasoningEffortGrokModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  if (model.id.includes('grok-3-mini')) {
    return true
  }

  return false
}

export function isReasoningModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  if (isEmbeddingModel(model)) {
    return false
  }

  if (model.provider === 'doubao' || model.id.includes('doubao')) {
    return (
      REASONING_REGEX.test(model.id) ||
      REASONING_REGEX.test(model.name) ||
      model.type?.includes('reasoning') ||
      isSupportedThinkingTokenDoubaoModel(model) ||
      false
    )
  }

  if (
    isClaudeReasoningModel(model) ||
    isOpenAIReasoningModel(model) ||
    isGeminiReasoningModel(model) ||
    isQwenReasoningModel(model) ||
    isGrokReasoningModel(model) ||
    model.id.includes('glm-z1') ||
    model.id.includes('magistral')
  ) {
    return true
  }

  return REASONING_REGEX.test(model.id) || model.type?.includes('reasoning') || false
}

// Doubao 支持思考模式的模型正则
export const DOUBAO_THINKING_MODEL_REGEX =
  /doubao-(?:1[.-]5-thinking-vision-pro|1[.-]5-thinking-pro-m|seed-1[.-]6(?:-flash)?(?!-(?:thinking)(?:-|$)))(?:-[\w-]+)*/i

export function isSupportedThinkingTokenDoubaoModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  return DOUBAO_THINKING_MODEL_REGEX.test(model.id) || DOUBAO_THINKING_MODEL_REGEX.test(model.name)
}

// 支持 auto 的 Doubao 模型
export const DOUBAO_THINKING_AUTO_MODEL_REGEX =
  /doubao-(1-5-thinking-pro-m|seed-1[.-]6)(?!-(?:flash|thinking)(?:-|$))(?:-[\w-]+)*/i

export function isDoubaoThinkingAutoModel(model: Model): boolean {
  return DOUBAO_THINKING_AUTO_MODEL_REGEX.test(model.id) || DOUBAO_THINKING_AUTO_MODEL_REGEX.test(model.name)
}

export const isSupportedThinkingTokenClaudeModel = isClaudeReasoningModel

export const isSupportedThinkingTokenGeminiModel = (model: Model): boolean => {
  return model.id.includes('gemini-2.5')
}

export function isSupportedReasoningEffortOpenAIModel(model: Model): boolean {
  return (
    (model.id.includes('o1') && !(model.id.includes('o1-preview') || model.id.includes('o1-mini'))) ||
    model.id.includes('o3') ||
    model.id.includes('o4')
  )
}

export function isSupportedReasoningEffortModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  return isSupportedReasoningEffortOpenAIModel(model) || isSupportedReasoningEffortGrokModel(model)
}

export function isSupportedThinkingTokenModel(model?: Model): boolean {
  if (!model) {
    return false
  }

  return (
    isSupportedThinkingTokenGeminiModel(model) ||
    isSupportedThinkingTokenQwenModel(model) ||
    isSupportedThinkingTokenClaudeModel(model) ||
    isSupportedThinkingTokenDoubaoModel(model)
  )
}

export type EffortRatio = Record<ReasoningEffortOptions, number>

export const EFFORT_RATIO: EffortRatio = {
  low: 0.2,
  medium: 0.5,
  high: 0.8,
  auto: 2
}
