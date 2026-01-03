import { saveTextAsFile } from '@/services/FileService'

import { createLongText, createMockFile } from '../../__mocks__/testData'
import { isLongText, processInputText } from '../../services/TextProcessingService'
import { LONG_TEXT_THRESHOLD } from '../../types'

jest.mock('@/services/FileService', () => ({
  saveTextAsFile: jest.fn()
}))

const mockSaveTextAsFile = saveTextAsFile as jest.MockedFunction<typeof saveTextAsFile>

describe('TextProcessingService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('isLongText', () => {
    it('returns false for text under threshold', () => {
      const text = createLongText(LONG_TEXT_THRESHOLD - 1)
      expect(isLongText(text)).toBe(false)
    })

    it('returns false for text at threshold', () => {
      const text = createLongText(LONG_TEXT_THRESHOLD)
      expect(isLongText(text)).toBe(false)
    })

    it('returns true for text over threshold', () => {
      const text = createLongText(LONG_TEXT_THRESHOLD + 1)
      expect(isLongText(text)).toBe(true)
    })

    it('uses default threshold of 5000', () => {
      expect(LONG_TEXT_THRESHOLD).toBe(5000)
      expect(isLongText(createLongText(5000))).toBe(false)
      expect(isLongText(createLongText(5001))).toBe(true)
    })

    it('supports custom threshold', () => {
      const customThreshold = 100
      expect(isLongText(createLongText(100), customThreshold)).toBe(false)
      expect(isLongText(createLongText(101), customThreshold)).toBe(true)
    })
  })

  describe('processInputText', () => {
    it('returns unchanged text when under threshold', async () => {
      const text = 'short text'
      const result = await processInputText(text)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.processedText).toBe(text)
        expect(result.data?.convertedToFile).toBeUndefined()
      }
      expect(mockSaveTextAsFile).not.toHaveBeenCalled()
    })

    it('converts long text to file', async () => {
      const text = createLongText(LONG_TEXT_THRESHOLD + 100)
      const mockFile = createMockFile({ name: 'converted.txt' })
      mockSaveTextAsFile.mockResolvedValue(mockFile)

      const result = await processInputText(text)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.processedText).toBe('')
        expect(result.data?.convertedToFile).toEqual(mockFile)
      }
      expect(mockSaveTextAsFile).toHaveBeenCalledWith(text)
    })

    it('calls onConvertToFile callback', async () => {
      const text = createLongText(LONG_TEXT_THRESHOLD + 100)
      const mockFile = createMockFile()
      mockSaveTextAsFile.mockResolvedValue(mockFile)
      const onConvertToFile = jest.fn()

      await processInputText(text, { onConvertToFile })

      expect(onConvertToFile).toHaveBeenCalledWith(mockFile)
    })

    it('returns error result on file save failure', async () => {
      const text = createLongText(LONG_TEXT_THRESHOLD + 100)
      mockSaveTextAsFile.mockRejectedValue(new Error('Save failed'))

      const result = await processInputText(text)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.type).toBe('long_text_conversion')
        expect(result.error.message).toBe('Save failed')
      }
    })

    it('uses custom threshold', async () => {
      const customThreshold = 10
      const shortText = 'short'
      const longText = 'this is long text'
      const mockFile = createMockFile()
      mockSaveTextAsFile.mockResolvedValue(mockFile)

      const shortResult = await processInputText(shortText, { threshold: customThreshold })
      expect(shortResult.success).toBe(true)
      if (shortResult.success) {
        expect(shortResult.data?.processedText).toBe(shortText)
      }

      const longResult = await processInputText(longText, { threshold: customThreshold })
      expect(longResult.success).toBe(true)
      if (longResult.success) {
        expect(longResult.data?.processedText).toBe('')
        expect(longResult.data?.convertedToFile).toEqual(mockFile)
      }
    })
  })
})
