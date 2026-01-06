import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { Image } from 'react-native-compressor'

import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'

const logger = loggerService.withContext('useFileAttachments')

export interface UseFileAttachmentsReturn {
  files: FileMetadata[]
  setFiles: Dispatch<SetStateAction<FileMetadata[]>>
  addFiles: (newFiles: FileMetadata[]) => void
  removeFile: (fileId: string) => void
  clearFiles: () => void
  handlePasteImages: (uris: string[]) => Promise<void>
}

/**
 * Hook for managing file attachments
 * Consolidated from Root.tsx lines 48-85 and useMessageInputLogic
 */
export function useFileAttachments(): UseFileAttachmentsReturn {
  const [files, setFiles] = useState<FileMetadata[]>([])

  const addFiles = (newFiles: FileMetadata[]) => {
    setFiles(prev => [...prev, ...newFiles])
  }

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const clearFiles = () => {
    setFiles([])
  }

  const handlePasteImages = async (uris: string[]) => {
    try {
      logger.info('Processing pasted images', { count: uris.length })

      const processedFiles = await Promise.all(
        uris.map(async (uri, index) => {
          const id = uuid()
          const fileName = `pasted-image-${Date.now()}-${index}`
          const ext = uri.toLowerCase().endsWith('.gif') ? '.gif' : '.jpg'

          // Compress non-GIF images
          const processedUri = ext === '.gif' ? uri : await Image.compress(uri)

          return {
            id,
            name: `${fileName}${ext}`,
            origin_name: `${fileName}${ext}`,
            path: processedUri,
            size: 0,
            ext,
            type: FileTypes.IMAGE,
            created_at: Date.now(),
            count: 1
          }
        })
      )

      const uploadedFiles = await uploadFiles(processedFiles)
      setFiles(prev => [...prev, ...uploadedFiles])

      logger.info('Pasted images processed successfully', { count: uploadedFiles.length })
    } catch (err) {
      logger.error('Error processing pasted images', err)
    }
  }

  return {
    files,
    setFiles,
    addFiles,
    removeFile,
    clearFiles,
    handlePasteImages
  }
}
