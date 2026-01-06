import { FileTypes } from '@/types/file'
import type { FileMessageBlock, Message } from '@/types/message'
import { MessageBlockStatus, MessageBlockType, UserMessageStatus } from '@/types/message'

import { convertFileBlockToTextPart, extractFileContent } from '../fileProcessor'

// Mock database to prevent SQLite initialization
jest.mock('@database', () => ({
  messageDatabase: {},
  messageBlockDatabase: {},
  assistantDatabase: {},
  providerDatabase: {},
  topicDatabase: {},
  fileDatabase: {}
}))

// Mock ProviderService to avoid database dependency
jest.mock('@/services/ProviderService', () => ({
  getProviderByModel: jest.fn()
}))

// Mock provider factory
jest.mock('@/aiCore/provider/factory', () => ({
  getAiSdkProviderId: jest.fn()
}))

// Mock modelCapabilities
jest.mock('../modelCapabilities', () => ({
  getFileSizeLimit: jest.fn(),
  supportsImageInput: jest.fn(),
  supportsLargeFileUpload: jest.fn(),
  supportsPdfInput: jest.fn()
}))

// Mock the pdf-text-extractor module
const mockExtractPdfText = jest.fn()
jest.mock('@/modules/pdf-text-extractor', () => ({
  extractPdfText: (...args: any[]) => mockExtractPdfText(...args)
}))

// Mock expo-file-system File
const mockTextSync = jest.fn()
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    textSync: mockTextSync
  }))
}))

// Mock LoggerService
jest.mock('@/services/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })
  }
}))

// Mock findFileBlocks
const mockFindFileBlocks = jest.fn()
jest.mock('@/utils/messageUtils/find', () => ({
  findFileBlocks: (...args: any[]) => mockFindFileBlocks(...args)
}))

describe('fileProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('extractFileContent', () => {
    const createMockMessage = (): Message => ({
      id: 'msg-1',
      role: 'user',
      topicId: 'topic-1',
      assistantId: 'assistant-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: UserMessageStatus.SUCCESS,
      blocks: []
    })

    const createMockFileBlock = (overrides: Partial<FileMessageBlock['file']> = {}): FileMessageBlock => ({
      id: 'block-1',
      messageId: 'msg-1',
      type: MessageBlockType.FILE,
      status: MessageBlockStatus.SUCCESS,
      createdAt: Date.now(),
      file: {
        id: 'file-1',
        name: 'test.pdf',
        origin_name: 'test.pdf',
        path: '/path/to/test.pdf',
        size: 1000,
        ext: '.pdf',
        type: FileTypes.DOCUMENT,
        created_at: Date.now(),
        count: 1,
        ...overrides
      }
    })

    it('should return empty string when no file blocks', async () => {
      mockFindFileBlocks.mockResolvedValue([])

      const result = await extractFileContent(createMockMessage())

      expect(result).toBe('')
    })

    it('should extract text from PDF files using native module', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockFindFileBlocks.mockResolvedValue([fileBlock])
      mockExtractPdfText.mockResolvedValue({
        text: 'PDF content here',
        totalPages: 5,
        extractedPages: 5,
        isTruncated: false,
        extractionError: false
      })

      const result = await extractFileContent(createMockMessage())

      expect(mockExtractPdfText).toHaveBeenCalledWith('/path/to/test.pdf', { maxPages: 20 })
      expect(result).toContain('PDF content here')
      expect(result).toContain('file: test.pdf')
    })

    it('should handle PDF extraction error gracefully', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockFindFileBlocks.mockResolvedValue([fileBlock])
      mockExtractPdfText.mockRejectedValue(new Error('Extraction failed'))

      const result = await extractFileContent(createMockMessage())

      expect(result).toContain('[PDF text extraction failed for test.pdf]')
    })

    it('should handle PDF with extractionError flag', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockFindFileBlocks.mockResolvedValue([fileBlock])
      mockExtractPdfText.mockResolvedValue({
        text: '',
        totalPages: 5,
        extractedPages: 0,
        isTruncated: false,
        extractionError: true
      })

      const result = await extractFileContent(createMockMessage())

      expect(result).toContain('[PDF text extraction had errors for test.pdf]')
    })

    it('should extract text from non-PDF text files', async () => {
      const fileBlock = createMockFileBlock({
        ext: '.txt',
        type: FileTypes.TEXT,
        origin_name: 'readme.txt'
      })
      mockFindFileBlocks.mockResolvedValue([fileBlock])
      mockTextSync.mockReturnValue('Text file content')

      const result = await extractFileContent(createMockMessage())

      expect(mockExtractPdfText).not.toHaveBeenCalled()
      expect(result).toContain('Text file content')
      expect(result).toContain('file: readme.txt')
    })

    it('should handle text file read error gracefully', async () => {
      const fileBlock = createMockFileBlock({
        ext: '.txt',
        type: FileTypes.TEXT,
        origin_name: 'readme.txt'
      })
      mockFindFileBlocks.mockResolvedValue([fileBlock])
      mockTextSync.mockImplementation(() => {
        throw new Error('File read error')
      })

      const result = await extractFileContent(createMockMessage())

      expect(result).toContain('[Failed to read file readme.txt]')
    })
  })

  describe('convertFileBlockToTextPart', () => {
    const createMockFileBlock = (overrides: Partial<FileMessageBlock['file']> = {}): FileMessageBlock => ({
      id: 'block-1',
      messageId: 'msg-1',
      type: MessageBlockType.FILE,
      status: MessageBlockStatus.SUCCESS,
      createdAt: Date.now(),
      file: {
        id: 'file-1',
        name: 'test.pdf',
        origin_name: 'test.pdf',
        path: '/path/to/test.pdf',
        size: 1000,
        ext: '.pdf',
        type: FileTypes.DOCUMENT,
        created_at: Date.now(),
        count: 1,
        ...overrides
      }
    })

    it('should convert PDF file block to text part', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockExtractPdfText.mockResolvedValue({
        text: 'PDF content',
        totalPages: 3,
        extractedPages: 3,
        isTruncated: false,
        extractionError: false
      })

      const result = await convertFileBlockToTextPart(fileBlock)

      expect(result).toEqual({
        type: 'text',
        text: 'test.pdf\nPDF content'
      })
      expect(mockExtractPdfText).toHaveBeenCalledWith('/path/to/test.pdf', { maxPages: 20 })
    })

    it('should return null when PDF has extractionError', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockExtractPdfText.mockResolvedValue({
        text: '',
        totalPages: 3,
        extractedPages: 0,
        isTruncated: false,
        extractionError: true
      })

      const result = await convertFileBlockToTextPart(fileBlock)

      expect(result).toBeNull()
    })

    it('should return null when PDF extraction throws error', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockExtractPdfText.mockRejectedValue(new Error('Extraction failed'))

      const result = await convertFileBlockToTextPart(fileBlock)

      expect(result).toBeNull()
    })

    it('should return null when PDF has no extractable text', async () => {
      const fileBlock = createMockFileBlock({ ext: '.pdf', type: FileTypes.DOCUMENT })
      mockExtractPdfText.mockResolvedValue({
        text: '   ',
        totalPages: 3,
        extractedPages: 3,
        isTruncated: false,
        extractionError: false
      })

      const result = await convertFileBlockToTextPart(fileBlock)

      expect(result).toBeNull()
    })

    it('should convert text file block to text part', async () => {
      const fileBlock = createMockFileBlock({
        ext: '.txt',
        type: FileTypes.TEXT,
        origin_name: 'readme.txt'
      })
      mockTextSync.mockReturnValue('Text file content')

      const result = await convertFileBlockToTextPart(fileBlock)

      expect(result).toEqual({
        type: 'text',
        text: 'readme.txt\nText file content'
      })
    })

    it('should return null for unsupported file types', async () => {
      const fileBlock = createMockFileBlock({
        ext: '.mp4',
        type: FileTypes.VIDEO,
        origin_name: 'video.mp4'
      })

      const result = await convertFileBlockToTextPart(fileBlock)

      expect(result).toBeNull()
    })
  })
})
