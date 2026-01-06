import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Image } from 'react-native-compressor'

import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'
import { getFileExtension, getFileType } from '@/utils/file'

import type { FileHandlerLoadingState, ToolOperationResult, ToolSheetError } from '../types'

const logger = loggerService.withContext('File Handler')

interface UseFileHandlerProps {
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  onSuccess?: () => void
}

interface UseFileHandlerReturn {
  handleAddImage: () => Promise<ToolOperationResult<FileMetadata[]>>
  handleAddFile: () => Promise<ToolOperationResult<FileMetadata[]>>
  handleTakePhoto: () => Promise<ToolOperationResult<FileMetadata>>
  loadingState: FileHandlerLoadingState
  error: ToolSheetError | null
  clearError: () => void
}

export function useFileHandler({ files, setFiles, onSuccess }: UseFileHandlerProps): UseFileHandlerReturn {
  const [mediaLibraryPermission, requestMediaLibraryPermission] = ImagePicker.useMediaLibraryPermissions()
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions()

  const [loadingState, setLoadingState] = useState<FileHandlerLoadingState>({
    isAddingImage: false,
    isAddingFile: false,
    isTakingPhoto: false
  })
  const [error, setError] = useState<ToolSheetError | null>(null)

  const clearError = () => setError(null)

  const handleAddImage = async (): Promise<ToolOperationResult<FileMetadata[]>> => {
    if (!mediaLibraryPermission?.granted) {
      const permissionResult = await requestMediaLibraryPermission()

      if (!permissionResult.granted) {
        logger.warn('Media library permission denied')
        const err: ToolSheetError = {
          type: 'permission',
          message: 'Media library permission denied',
          translationKey: 'error.permission.media_library_denied'
        }
        setError(err)
        return { success: false, error: err }
      }
    }

    setLoadingState(prev => ({ ...prev, isAddingImage: true }))
    setError(null)

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
        base64: true
      })

      if (result.canceled) {
        return { success: true }
      }

      const _files: Omit<FileMetadata, 'md5'>[] = await Promise.all(
        result.assets.map(async asset => {
          const id = uuid()
          // 压缩图片，如果失败则使用原始 URI
          let compressedUri: string
          try {
            compressedUri = await Image.compress(asset.uri)
          } catch (compressError) {
            logger.warn(`Failed to compress image ${asset.fileName}, using original`, compressError)
            compressedUri = asset.uri
          }
          const ext = getFileExtension(asset.fileName || '') || '.jpg'

          return {
            id: id,
            name: asset.fileName || id,
            origin_name: asset.fileName || id,
            path: compressedUri,
            size: asset.fileSize || 0,
            ext,
            type: getFileType(ext),
            mime_type: asset.mimeType || '',
            created_at: Date.now(),
            count: 1
          }
        })
      )

      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
      onSuccess?.()

      return { success: true, data: uploadedFiles }
    } catch (err) {
      logger.error('Error selecting image:', err)
      const error: ToolSheetError = {
        type: 'upload',
        message: err instanceof Error ? err.message : 'Unknown error',
        translationKey: 'error.upload.failed'
      }
      setError(error)
      return { success: false, error }
    } finally {
      setLoadingState(prev => ({ ...prev, isAddingImage: false }))
    }
  }

  const handleAddFile = async (): Promise<ToolOperationResult<FileMetadata[]>> => {
    setLoadingState(prev => ({ ...prev, isAddingFile: true }))
    setError(null)

    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: ['text/*', 'application/pdf', 'application/octet-stream']
      })

      if (result.canceled) {
        return { success: true }
      }

      const _files: Omit<FileMetadata, 'md5'>[] = result.assets.map(asset => {
        const ext = getFileExtension(asset.name)
        return {
          id: uuid(),
          name: asset.name,
          origin_name: asset.name,
          path: asset.uri,
          size: asset.size || 0,
          ext,
          type: getFileType(ext),
          mime_type: asset.mimeType || '',
          created_at: Date.now(),
          count: 1
        }
      })

      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
      onSuccess?.()

      return { success: true, data: uploadedFiles }
    } catch (err) {
      logger.error('Error selecting file:', err)
      const error: ToolSheetError = {
        type: 'upload',
        message: err instanceof Error ? err.message : 'Unknown error',
        translationKey: 'error.upload.failed'
      }
      setError(error)
      return { success: false, error }
    } finally {
      setLoadingState(prev => ({ ...prev, isAddingFile: false }))
    }
  }

  const handleAddPhotoFromCamera = async (photoUri: string): Promise<ToolOperationResult<FileMetadata>> => {
    try {
      const file = new FileSystem.File(photoUri)

      if (!file.exists) {
        logger.error('Photo from camera not found at uri:', photoUri)
        const err: ToolSheetError = {
          type: 'camera',
          message: 'Photo file not found',
          translationKey: 'error.camera.file_not_found'
        }
        setError(err)
        return { success: false, error: err }
      }

      const id = uuid()
      const fileName = photoUri.split('/').pop() || `${id}.jpg`
      const ext = getFileExtension(fileName) || '.jpg'
      // 压缩图片，如果失败则使用原始 URI
      let compressedUri: string
      try {
        compressedUri = await Image.compress(photoUri)
      } catch (compressError) {
        logger.warn(`Failed to compress camera photo, using original`, compressError)
        compressedUri = photoUri
      }

      const _file: Omit<FileMetadata, 'md5'> = {
        id: id,
        name: fileName,
        origin_name: fileName,
        path: compressedUri,
        size: file.size,
        ext,
        type: FileTypes.IMAGE,
        created_at: Date.now(),
        count: 1
      }

      const uploadedFiles = await uploadFiles([_file])
      setFiles([...files, ...uploadedFiles])

      return { success: true, data: uploadedFiles[0] }
    } catch (err) {
      logger.error('Error processing camera photo:', err)
      const error: ToolSheetError = {
        type: 'upload',
        message: err instanceof Error ? err.message : 'Unknown error',
        translationKey: 'error.upload.failed'
      }
      setError(error)
      return { success: false, error }
    }
  }

  const handleTakePhoto = async (): Promise<ToolOperationResult<FileMetadata>> => {
    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission()

      if (!permissionResult.granted) {
        logger.warn('Camera permission denied')
        const err: ToolSheetError = {
          type: 'permission',
          message: 'Camera permission denied',
          translationKey: 'error.permission.camera_denied'
        }
        setError(err)
        return { success: false, error: err }
      }
    }

    setLoadingState(prev => ({ ...prev, isTakingPhoto: true }))
    setError(null)

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.2,
        allowsEditing: true
      })

      if (result.canceled || !result.assets[0]) {
        return { success: true }
      }

      const photoResult = await handleAddPhotoFromCamera(result.assets[0].uri)
      if (photoResult.success) {
        onSuccess?.()
      }

      return photoResult
    } catch (err) {
      logger.error('Error taking photo:', err)
      const error: ToolSheetError = {
        type: 'camera',
        message: err instanceof Error ? err.message : 'Unknown error',
        translationKey: 'error.camera.failed'
      }
      setError(error)
      return { success: false, error }
    } finally {
      setLoadingState(prev => ({ ...prev, isTakingPhoto: false }))
    }
  }

  return {
    handleAddImage,
    handleAddFile,
    handleTakePhoto,
    loadingState,
    error,
    clearError
  }
}
