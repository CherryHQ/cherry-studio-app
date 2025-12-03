import type { Model } from '@/types/assistant'
import { getLowerBaseModelName } from '@/utils/naming'

export const isGPT5SeriesModel = (model: Model) => {
  const modelId = getLowerBaseModelName(model.id)
  return modelId.includes('gpt-5') && !modelId.includes('gpt-5.1')
}

export const isGPT51SeriesModel = (model: Model) => {
  const modelId = getLowerBaseModelName(model.id)
  return modelId.includes('gpt-5.1')
}

export const isGPT5ProModel = (model: Model) => {
  const modelId = getLowerBaseModelName(model.id)
  return modelId.includes('gpt-5-pro')
}

export const isAnthropicModel = (model?: Model): boolean => {
  if (!model) {
    return false
  }
  const modelId = getLowerBaseModelName(model.id)
  return modelId.startsWith('claude')
}
