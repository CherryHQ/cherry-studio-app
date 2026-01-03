import { createMockAssistant, createMockModel, createMockProvider } from '../../__mocks__/testData'
import { getInitialMentions, handleModelChange, validateMentions } from '../../services/MentionValidationService'

describe('MentionValidationService', () => {
  describe('validateMentions', () => {
    it('returns all mentions when all are valid', () => {
      const model1 = createMockModel({ id: 'model-1', provider: 'provider-1' })
      const model2 = createMockModel({ id: 'model-2', provider: 'provider-1' })
      const mentions = [model1, model2]
      const providers = [createMockProvider({ id: 'provider-1', models: [model1, model2] })]

      const result = validateMentions(mentions, providers)

      expect(result.validMentions).toHaveLength(2)
      expect(result.removedCount).toBe(0)
    })

    it('filters out invalid mentions', () => {
      const validModel = createMockModel({ id: 'valid-model', provider: 'provider-1' })
      const invalidModel = createMockModel({ id: 'invalid-model', provider: 'provider-2' })
      const mentions = [validModel, invalidModel]
      const providers = [createMockProvider({ id: 'provider-1', models: [validModel] })]

      const result = validateMentions(mentions, providers)

      expect(result.validMentions).toHaveLength(1)
      expect(result.validMentions[0]).toEqual(validModel)
      expect(result.removedCount).toBe(1)
    })

    it('handles empty mentions array', () => {
      const providers = [createMockProvider()]

      const result = validateMentions([], providers)

      expect(result.validMentions).toHaveLength(0)
      expect(result.removedCount).toBe(0)
    })

    it('handles empty providers array', () => {
      const mentions = [createMockModel()]

      const result = validateMentions(mentions, [])

      expect(result.validMentions).toHaveLength(0)
      expect(result.removedCount).toBe(1)
    })

    it('ignores disabled providers', () => {
      const model = createMockModel({ id: 'model-1', provider: 'provider-1' })
      const mentions = [model]
      const providers = [createMockProvider({ id: 'provider-1', enabled: false, models: [model] })]

      const result = validateMentions(mentions, providers)

      expect(result.validMentions).toHaveLength(0)
      expect(result.removedCount).toBe(1)
    })
  })

  describe('getInitialMentions', () => {
    it('returns assistant.model when set', () => {
      const model = createMockModel({ id: 'primary-model' })
      const assistant = createMockAssistant({ model })

      const result = getInitialMentions(assistant)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(model)
    })

    it('returns assistant.defaultModel as fallback', () => {
      const defaultModel = createMockModel({ id: 'default-model' })
      const assistant = createMockAssistant({ model: undefined, defaultModel })

      const result = getInitialMentions(assistant)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(defaultModel)
    })

    it('returns empty array when neither set', () => {
      const assistant = createMockAssistant({ model: undefined, defaultModel: undefined })

      const result = getInitialMentions(assistant)

      expect(result).toHaveLength(0)
    })

    it('prefers model over defaultModel', () => {
      const model = createMockModel({ id: 'primary-model' })
      const defaultModel = createMockModel({ id: 'default-model' })
      const assistant = createMockAssistant({ model, defaultModel })

      const result = getInitialMentions(assistant)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(model)
    })
  })

  describe('handleModelChange', () => {
    it('updates assistant with first model', async () => {
      const model = createMockModel({ id: 'new-model' })
      const assistant = createMockAssistant({ defaultModel: createMockModel({ id: 'default' }) })
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      const result = await handleModelChange([model], assistant, updateAssistant)

      expect(result.success).toBe(true)
      expect(updateAssistant).toHaveBeenCalledWith(expect.objectContaining({ model }))
    })

    it('returns success result', async () => {
      const model = createMockModel()
      const assistant = createMockAssistant()
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      const result = await handleModelChange([model], assistant, updateAssistant)

      expect(result.success).toBe(true)
    })

    it('handles empty models array', async () => {
      const assistant = createMockAssistant()
      const updateAssistant = jest.fn()

      const result = await handleModelChange([], assistant, updateAssistant)

      expect(result.success).toBe(true)
      expect(updateAssistant).not.toHaveBeenCalled()
    })

    it('sets both model and defaultModel when defaultModel is not set', async () => {
      const model = createMockModel({ id: 'new-model' })
      const assistant = createMockAssistant({ defaultModel: undefined })
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      await handleModelChange([model], assistant, updateAssistant)

      expect(updateAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          model,
          defaultModel: model
        })
      )
    })

    it('only updates model when defaultModel already exists', async () => {
      const newModel = createMockModel({ id: 'new-model' })
      const existingDefault = createMockModel({ id: 'existing-default' })
      const assistant = createMockAssistant({ defaultModel: existingDefault })
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      await handleModelChange([newModel], assistant, updateAssistant)

      expect(updateAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          model: newModel,
          defaultModel: existingDefault
        })
      )
    })

    it('returns error result on update failure', async () => {
      const model = createMockModel()
      const assistant = createMockAssistant()
      const updateAssistant = jest.fn().mockRejectedValue(new Error('Update failed'))

      const result = await handleModelChange([model], assistant, updateAssistant)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.type).toBe('mention_validation')
        expect(result.error.message).toBe('Update failed')
      }
    })
  })
})
