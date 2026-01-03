import { isGenerateImageModel } from '@/config/models/vision'
import { isWebSearchModel } from '@/config/models/websearch'

import { createMockAssistant, createMockModel } from '../../__mocks__/testData'
import {
  getEnabledTools,
  getToolConfig,
  isToolEnabled,
  toggleTool,
  TOOL_CONFIGS
} from '../../services/ToolAvailabilityService'

jest.mock('@/componentsV2/icons/LucideIcon', () => ({
  Globe: () => null,
  Palette: () => null
}))

jest.mock('@/config/models/vision', () => ({
  isGenerateImageModel: jest.fn()
}))

jest.mock('@/config/models/websearch', () => ({
  isWebSearchModel: jest.fn()
}))

const mockIsGenerateImageModel = isGenerateImageModel as jest.MockedFunction<typeof isGenerateImageModel>
const mockIsWebSearchModel = isWebSearchModel as jest.MockedFunction<typeof isWebSearchModel>

describe('ToolAvailabilityService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsGenerateImageModel.mockReturnValue(false)
    mockIsWebSearchModel.mockReturnValue(false)
  })

  describe('TOOL_CONFIGS', () => {
    it('has enableGenerateImage config', () => {
      expect(TOOL_CONFIGS.enableGenerateImage).toBeDefined()
      expect(TOOL_CONFIGS.enableGenerateImage.labelKey).toBe('common.generateImage')
    })

    it('has enableWebSearch config', () => {
      expect(TOOL_CONFIGS.enableWebSearch).toBeDefined()
      expect(TOOL_CONFIGS.enableWebSearch.labelKey).toBe('common.websearch')
    })
  })

  describe('getEnabledTools', () => {
    it('returns enableGenerateImage when model supports it', () => {
      mockIsGenerateImageModel.mockReturnValue(true)
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableGenerateImage: true
      })

      const result = getEnabledTools(assistant)

      expect(result).toContain('enableGenerateImage')
    })

    it('returns enableWebSearch when enabled and model supports it', () => {
      mockIsWebSearchModel.mockReturnValue(true)
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableWebSearch: true
      })

      const result = getEnabledTools(assistant)

      expect(result).toContain('enableWebSearch')
    })

    it('returns enableWebSearch when using tool mode with provider', () => {
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableWebSearch: true,
        settings: { toolUseMode: true } as any,
        webSearchProviderId: 'some-provider'
      })

      const result = getEnabledTools(assistant)

      expect(result).toContain('enableWebSearch')
    })

    it('returns empty array when no tools enabled', () => {
      const assistant = createMockAssistant({
        enableGenerateImage: false,
        enableWebSearch: false
      })

      const result = getEnabledTools(assistant)

      expect(result).toHaveLength(0)
    })

    it('does not return enableGenerateImage when model does not support it', () => {
      mockIsGenerateImageModel.mockReturnValue(false)
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableGenerateImage: true
      })

      const result = getEnabledTools(assistant)

      expect(result).not.toContain('enableGenerateImage')
    })
  })

  describe('isToolEnabled', () => {
    it('checks model capability for image generation', () => {
      mockIsGenerateImageModel.mockReturnValue(true)
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableGenerateImage: true
      })

      const result = isToolEnabled('enableGenerateImage', assistant)

      expect(result).toBe(true)
      expect(mockIsGenerateImageModel).toHaveBeenCalledWith(assistant.model)
    })

    it('returns false when enableGenerateImage is off', () => {
      mockIsGenerateImageModel.mockReturnValue(true)
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableGenerateImage: false
      })

      const result = isToolEnabled('enableGenerateImage', assistant)

      expect(result).toBe(false)
    })

    it('checks assistant setting and model for web search', () => {
      mockIsWebSearchModel.mockReturnValue(true)
      const assistant = createMockAssistant({
        model: createMockModel(),
        enableWebSearch: true
      })

      const result = isToolEnabled('enableWebSearch', assistant)

      expect(result).toBe(true)
    })

    it('returns false when no model is set', () => {
      mockIsGenerateImageModel.mockReturnValue(true)
      const assistant = createMockAssistant({
        model: undefined,
        enableGenerateImage: true
      })

      const result = isToolEnabled('enableGenerateImage', assistant)

      expect(result).toBe(false)
    })
  })

  describe('getToolConfig', () => {
    it('returns config with key included', () => {
      const config = getToolConfig('enableGenerateImage')

      expect(config.key).toBe('enableGenerateImage')
      expect(config.labelKey).toBe('common.generateImage')
      expect(config.icon).toBeDefined()
      expect(config.isEnabled).toBeInstanceOf(Function)
    })

    it('returns config for enableWebSearch', () => {
      const config = getToolConfig('enableWebSearch')

      expect(config.key).toBe('enableWebSearch')
      expect(config.labelKey).toBe('common.websearch')
    })
  })

  describe('toggleTool', () => {
    it('toggles tool on', async () => {
      const assistant = createMockAssistant({ enableGenerateImage: false })
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      const result = await toggleTool('enableGenerateImage', assistant, updateAssistant)

      expect(result.success).toBe(true)
      expect(updateAssistant).toHaveBeenCalledWith(expect.objectContaining({ enableGenerateImage: true }))
    })

    it('toggles tool off', async () => {
      const assistant = createMockAssistant({ enableGenerateImage: true })
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      const result = await toggleTool('enableGenerateImage', assistant, updateAssistant)

      expect(result.success).toBe(true)
      expect(updateAssistant).toHaveBeenCalledWith(expect.objectContaining({ enableGenerateImage: false }))
    })

    it('calls updateAssistant with updated settings', async () => {
      const assistant = createMockAssistant({
        id: 'test-assistant',
        enableWebSearch: false
      })
      const updateAssistant = jest.fn().mockResolvedValue(undefined)

      await toggleTool('enableWebSearch', assistant, updateAssistant)

      expect(updateAssistant).toHaveBeenCalledWith({
        ...assistant,
        enableWebSearch: true
      })
    })

    it('returns error result on failure', async () => {
      const assistant = createMockAssistant()
      const updateAssistant = jest.fn().mockRejectedValue(new Error('Toggle failed'))

      const result = await toggleTool('enableGenerateImage', assistant, updateAssistant)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.type).toBe('general')
        expect(result.error.message).toBe('Toggle failed')
      }
    })
  })
})
