import type { Model, ModelType } from '@/types/assistant'

import { getModelUniqId, isUserSelectedModelType } from '../model'

describe('model utils', () => {
  describe('getModelUniqId', () => {
    it('should return JSON string with id and provider', () => {
      const model: Partial<Model> = {
        id: 'google/gemini-2.5-flash',
        provider: 'cherryin',
        name: 'Gemini Flash'
      }
      const result = getModelUniqId(model as Model)
      const parsed = JSON.parse(result)
      expect(parsed).toEqual({
        id: 'google/gemini-2.5-flash',
        provider: 'cherryin'
      })
    })

    it('should only include id and provider, not other properties', () => {
      const model: any = {
        id: 'test-model',
        provider: 'test-provider',
        name: 'Test Model',
        version: '1.0',
        description: 'Test description'
      }
      const result = getModelUniqId(model)
      const parsed = JSON.parse(result)
      expect(Object.keys(parsed)).toHaveLength(2)
      expect(parsed.id).toBe('test-model')
      expect(parsed.provider).toBe('test-provider')
      expect(parsed.name).toBeUndefined()
      expect(parsed.version).toBeUndefined()
    })

    it('should return empty string for undefined model', () => {
      expect(getModelUniqId(undefined)).toBe('')
    })

    it('should return empty string for model without id', () => {
      const model: any = {
        provider: 'test-provider',
        name: 'Test Model'
      }
      expect(getModelUniqId(model)).toBe('')
    })

    it('should handle model with id but no provider', () => {
      const model: any = {
        id: 'test-model',
        name: 'Test Model'
      }
      const result = getModelUniqId(model)
      const parsed = JSON.parse(result)
      expect(parsed.id).toBe('test-model')
      expect(parsed.provider).toBeUndefined()
    })
  })

  describe('isUserSelectedModelType', () => {
    it('should return true when capability type matches and is user selected', () => {
      const model: Partial<Model> = {
        id: 'test-model',
        capabilities: [
          {
            type: 'chat' as ModelType,
            isUserSelected: true
          }
        ]
      }
      expect(isUserSelectedModelType(model as Model, 'chat' as ModelType)).toBe(true)
    })

    it('should return false when capability type matches and is not user selected', () => {
      const model: Partial<Model> = {
        id: 'test-model',
        capabilities: [
          {
            type: 'chat' as ModelType,
            isUserSelected: false
          }
        ]
      }
      expect(isUserSelectedModelType(model as Model, 'chat' as ModelType)).toBe(false)
    })

    it('should return undefined when capability type is not found', () => {
      const model: Partial<Model> = {
        id: 'test-model',
        capabilities: [
          {
            type: 'chat' as ModelType,
            isUserSelected: true
          }
        ]
      }
      expect(isUserSelectedModelType(model as Model, 'completion' as ModelType)).toBeUndefined()
    })

    it('should return undefined when model has no capabilities', () => {
      const model: Partial<Model> = {
        id: 'test-model',
        capabilities: []
      }
      expect(isUserSelectedModelType(model as Model, 'chat' as ModelType)).toBeUndefined()
    })

    it('should return undefined when capabilities is undefined', () => {
      const model: Partial<Model> = {
        id: 'test-model'
      }
      expect(isUserSelectedModelType(model as Model, 'chat' as ModelType)).toBeUndefined()
    })

    it('should handle multiple capabilities and find the matching one', () => {
      const model: Partial<Model> = {
        id: 'test-model',
        capabilities: [
          {
            type: 'chat' as ModelType,
            isUserSelected: false
          },
          {
            type: 'completion' as ModelType,
            isUserSelected: true
          },
          {
            type: 'embedding' as ModelType,
            isUserSelected: false
          }
        ]
      }
      expect(isUserSelectedModelType(model as Model, 'completion' as ModelType)).toBe(true)
      expect(isUserSelectedModelType(model as Model, 'chat' as ModelType)).toBe(false)
      expect(isUserSelectedModelType(model as Model, 'embedding' as ModelType)).toBe(false)
    })
  })
})
