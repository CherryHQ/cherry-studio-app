import type { Model } from '@/types/assistant'

// `vision.ts` / `websearch.ts` pull in `@/services/ProviderService`, whose module
// graph opens expo-sqlite (unavailable in jest). Mock it so the pure model
// classification logic below can be tested directly.
jest.mock('@/services/ProviderService', () => ({
  getProviderByModel: jest.fn()
}))

import {
  getThinkModelType,
  isDeepSeekHybridInferenceModel,
  isDeepSeekV4Model,
  isReasoningModel,
  MODEL_SUPPORTED_OPTIONS,
  MODEL_SUPPORTED_REASONING_EFFORT
} from '../reasoning'

const makeModel = (id: string, provider = 'deepseek'): Model => ({
  id,
  provider,
  name: id,
  group: ''
})

describe('DeepSeek V4 reasoning support', () => {
  describe('isDeepSeekV4Model', () => {
    it.each([
      'deepseek-v4-flash',
      'deepseek-v4-flash-latest',
      'deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4-pro'
    ])('matches %s', id => {
      expect(isDeepSeekV4Model(makeModel(id))).toBe(true)
    })

    it.each(['deepseek-v3.1', 'deepseek-v3-2', 'deepseek-chat-v3.1', 'deepseek-chat', 'deepseek-r1', 'gpt-4o'])(
      'does not match %s',
      id => {
        expect(isDeepSeekV4Model(makeModel(id))).toBe(false)
      }
    )
  })

  describe('isDeepSeekHybridInferenceModel', () => {
    it('still matches V3 hybrid models only', () => {
      expect(isDeepSeekHybridInferenceModel(makeModel('deepseek-v3-1'))).toBe(true)
      expect(isDeepSeekHybridInferenceModel(makeModel('deepseek-chat-v3.1'))).toBe(true)
      expect(isDeepSeekHybridInferenceModel(makeModel('deepseek-v4-flash'))).toBe(false)
    })
  })

  describe('isReasoningModel', () => {
    it('recognizes DeepSeek V4 models as reasoning models', () => {
      expect(isReasoningModel(makeModel('deepseek-v4-flash'))).toBe(true)
      expect(isReasoningModel(makeModel('deepseek-v4-flash-latest'))).toBe(true)
      expect(isReasoningModel(makeModel('deepseek-v4-pro'))).toBe(true)
    })

    it('keeps non-reasoning models negative', () => {
      expect(isReasoningModel(makeModel('deepseek-chat'))).toBe(false)
    })
  })

  describe('getThinkModelType', () => {
    it('maps DeepSeek V4 to deepseek_v4 type', () => {
      expect(getThinkModelType(makeModel('deepseek-v4-flash'))).toBe('deepseek_v4')
      expect(getThinkModelType(makeModel('deepseek-v4-pro'))).toBe('deepseek_v4')
    })

    it('keeps DeepSeek V3 hybrid models on deepseek_hybrid type', () => {
      expect(getThinkModelType(makeModel('deepseek-v3-1'))).toBe('deepseek_hybrid')
    })
  })

  describe('effort options', () => {
    it('exposes selectable reasoning effort levels for V4', () => {
      expect(MODEL_SUPPORTED_REASONING_EFFORT.deepseek_v4).toEqual(['none', 'low', 'high', 'max', 'xhigh'])
      expect(MODEL_SUPPORTED_OPTIONS.deepseek_v4).toEqual(['none', 'low', 'high', 'max', 'xhigh'])
    })

    it('keeps V3 hybrid models to a simple on/off toggle', () => {
      expect(MODEL_SUPPORTED_OPTIONS.deepseek_hybrid).toEqual(['none', 'auto'])
    })
  })
})
