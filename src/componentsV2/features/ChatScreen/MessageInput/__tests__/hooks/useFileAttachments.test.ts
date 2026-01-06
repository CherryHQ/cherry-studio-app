import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Image } from 'react-native-compressor'

import { uploadFiles } from '@/services/FileService'
import { FileTypes } from '@/types/file'

import { createMockFile } from '../../__mocks__/testData'
import { useFileAttachments } from '../../hooks/useFileAttachments'

jest.mock('react-native-compressor', () => ({
  Image: {
    compress: jest.fn()
  }
}))

jest.mock('@/services/FileService', () => ({
  uploadFiles: jest.fn()
}))

const mockImageCompress = Image.compress as jest.MockedFunction<typeof Image.compress>
const mockUploadFiles = uploadFiles as jest.MockedFunction<typeof uploadFiles>

describe('useFileAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockImageCompress.mockImplementation(async uri => `compressed-${uri}`)
  })

  describe('initial state', () => {
    it('initializes with empty files array', () => {
      const { result } = renderHook(() => useFileAttachments())

      expect(result.current.files).toEqual([])
    })
  })

  describe('addFiles', () => {
    it('adds files to empty list', () => {
      const { result } = renderHook(() => useFileAttachments())
      const file = createMockFile({ id: 'file-1' })

      act(() => {
        result.current.addFiles([file])
      })

      expect(result.current.files).toHaveLength(1)
      expect(result.current.files[0].id).toBe('file-1')
    })

    it('adds multiple files', () => {
      const { result } = renderHook(() => useFileAttachments())
      const file1 = createMockFile({ id: 'file-1' })
      const file2 = createMockFile({ id: 'file-2' })

      act(() => {
        result.current.addFiles([file1, file2])
      })

      expect(result.current.files).toHaveLength(2)
    })

    it('appends to existing files', () => {
      const { result } = renderHook(() => useFileAttachments())
      const file1 = createMockFile({ id: 'file-1' })
      const file2 = createMockFile({ id: 'file-2' })

      act(() => {
        result.current.addFiles([file1])
      })
      act(() => {
        result.current.addFiles([file2])
      })

      expect(result.current.files).toHaveLength(2)
      expect(result.current.files[0].id).toBe('file-1')
      expect(result.current.files[1].id).toBe('file-2')
    })
  })

  describe('removeFile', () => {
    it('removes file by id', () => {
      const { result } = renderHook(() => useFileAttachments())
      const file1 = createMockFile({ id: 'file-1' })
      const file2 = createMockFile({ id: 'file-2' })

      act(() => {
        result.current.addFiles([file1, file2])
      })
      act(() => {
        result.current.removeFile('file-1')
      })

      expect(result.current.files).toHaveLength(1)
      expect(result.current.files[0].id).toBe('file-2')
    })

    it('does nothing if file not found', () => {
      const { result } = renderHook(() => useFileAttachments())
      const file = createMockFile({ id: 'file-1' })

      act(() => {
        result.current.addFiles([file])
      })
      act(() => {
        result.current.removeFile('non-existent')
      })

      expect(result.current.files).toHaveLength(1)
    })
  })

  describe('clearFiles', () => {
    it('clears all files', () => {
      const { result } = renderHook(() => useFileAttachments())
      const file1 = createMockFile({ id: 'file-1' })
      const file2 = createMockFile({ id: 'file-2' })

      act(() => {
        result.current.addFiles([file1, file2])
      })
      act(() => {
        result.current.clearFiles()
      })

      expect(result.current.files).toEqual([])
    })

    it('does nothing when already empty', () => {
      const { result } = renderHook(() => useFileAttachments())

      act(() => {
        result.current.clearFiles()
      })

      expect(result.current.files).toEqual([])
    })
  })

  describe('handlePasteImages', () => {
    it('processes and uploads pasted images', async () => {
      const uploadedFile = createMockFile({ id: 'uploaded-1', type: FileTypes.IMAGE })
      mockUploadFiles.mockResolvedValue([uploadedFile])

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///image1.jpg'])
      })

      await waitFor(() => {
        expect(result.current.files).toHaveLength(1)
      })
      expect(mockUploadFiles).toHaveBeenCalled()
    })

    it('compresses non-GIF images', async () => {
      const uploadedFile = createMockFile({ id: 'uploaded-1' })
      mockUploadFiles.mockResolvedValue([uploadedFile])

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///image.jpg'])
      })

      expect(mockImageCompress).toHaveBeenCalledWith('file:///image.jpg')
    })

    it('skips compression for GIF images', async () => {
      const uploadedFile = createMockFile({ id: 'uploaded-1' })
      mockUploadFiles.mockResolvedValue([uploadedFile])

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///image.gif'])
      })

      expect(mockImageCompress).not.toHaveBeenCalled()
    })

    it('handles multiple pasted images', async () => {
      const uploadedFiles = [createMockFile({ id: 'uploaded-1' }), createMockFile({ id: 'uploaded-2' })]
      mockUploadFiles.mockResolvedValue(uploadedFiles)

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///image1.jpg', 'file:///image2.jpg'])
      })

      await waitFor(() => {
        expect(result.current.files).toHaveLength(2)
      })
    })

    it('appends to existing files', async () => {
      const existingFile = createMockFile({ id: 'existing-1' })
      const uploadedFile = createMockFile({ id: 'uploaded-1' })
      mockUploadFiles.mockResolvedValue([uploadedFile])

      const { result } = renderHook(() => useFileAttachments())

      act(() => {
        result.current.addFiles([existingFile])
      })

      await act(async () => {
        await result.current.handlePasteImages(['file:///image.jpg'])
      })

      await waitFor(() => {
        expect(result.current.files).toHaveLength(2)
      })
    })

    it('handles upload errors gracefully', async () => {
      mockUploadFiles.mockRejectedValue(new Error('Upload failed'))

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///image.jpg'])
      })

      // Should not throw and files should remain empty
      expect(result.current.files).toEqual([])
    })

    it('creates file metadata with correct properties', async () => {
      mockUploadFiles.mockImplementation(async files => files)

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///image.jpg'])
      })

      expect(mockUploadFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: FileTypes.IMAGE,
            ext: '.jpg'
          })
        ])
      )
    })

    it('handles GIF extension correctly', async () => {
      mockUploadFiles.mockImplementation(async files => files)

      const { result } = renderHook(() => useFileAttachments())

      await act(async () => {
        await result.current.handlePasteImages(['file:///animation.GIF'])
      })

      expect(mockUploadFiles).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            ext: '.gif'
          })
        ])
      )
    })
  })

  describe('setFiles', () => {
    it('allows direct setting of files', () => {
      const { result } = renderHook(() => useFileAttachments())
      const files = [createMockFile({ id: 'file-1' }), createMockFile({ id: 'file-2' })]

      act(() => {
        result.current.setFiles(files)
      })

      expect(result.current.files).toEqual(files)
    })

    it('allows functional update of files', () => {
      const { result } = renderHook(() => useFileAttachments())
      const initialFile = createMockFile({ id: 'file-1' })

      act(() => {
        result.current.addFiles([initialFile])
      })
      act(() => {
        result.current.setFiles(prev => prev.filter(f => f.id !== 'file-1'))
      })

      expect(result.current.files).toEqual([])
    })
  })
})
