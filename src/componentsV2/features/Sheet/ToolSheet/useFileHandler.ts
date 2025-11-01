import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'react-native-compressor'

import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'
import { getFileType } from '@/utils/file'

const logger = loggerService.withContext('File Handler')

interface UseFileHandlerProps {
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
  onSuccess?: () => void
}

export const useFileHandler = ({ files, setFiles, onSuccess }: UseFileHandlerProps) => {
  const [permission, requestPermission] = ImagePicker.useMediaLibraryPermissions()

  const handleAddImage = async () => {
    if (!permission?.granted) {
      const cameraPermission = await requestPermission()

      if (!cameraPermission.granted) {
        logger.info('Camera permission denied')
        return
      }
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
        base64: true
      })

      if (result.canceled) {
        return
      }

      const _files: Omit<FileMetadata, 'md5'>[] = await Promise.all(
        result.assets.map(async asset => {
          const id = uuid()
          const compressedUri = await Image.compress(asset.uri)

          return {
            id: id,
            name: asset.fileName || id,
            origin_name: asset.fileName || id,
            path: compressedUri,
            size: asset.fileSize || 0,
            ext: asset.fileName?.split('.').pop() || 'jpg',
            type: getFileType(asset.fileName?.split('.').pop() || 'jpg'),
            mime_type: asset.mimeType || '',
            created_at: Date.now(),
            count: 1
          }
        })
      )

      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
      onSuccess?.()
    } catch (error) {
      logger.error('Error selecting image:', error)
    }
  }

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, type: ['text/plain'] })

      if (result.canceled) {
        return
      }

      const _files: Omit<FileMetadata, 'md5'>[] = result.assets.map(asset => {
        return {
          id: uuid(),
          name: asset.name,
          origin_name: asset.name,
          path: asset.uri,
          size: asset.size || 0,
          ext: asset.name.split('.').pop() || '',
          type: getFileType(asset.name.split('.').pop() || ''),
          mime_type: asset.mimeType || '',
          created_at: Date.now(),
          count: 1
        }
      })

      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
      onSuccess?.()
    } catch (error) {
      logger.error('Error selecting file:', error)
    }
  }

  const handleAddPhotoFromCamera = async (photoUri: string) => {
    try {
      const file = new FileSystem.File(photoUri)

      if (!file.exists) {
        logger.error('Photo from camera not found at uri:', photoUri)
        return
      }

      const id = uuid()
      const fileName = photoUri.split('/').pop() || `${id}.jpg`
      const compressedUri = await Image.compress(photoUri)

      const _file: Omit<FileMetadata, 'md5'> = {
        id: id,
        name: fileName,
        origin_name: fileName,
        path: compressedUri,
        size: file.size,
        ext: 'jpg',
        type: FileTypes.IMAGE,
        created_at: Date.now(),
        count: 1
      }

      const uploadedFiles = await uploadFiles([_file])
      setFiles([...files, ...uploadedFiles])
    } catch (error) {
      logger.error('Error processing camera photo:', error)
    }
  }

  return {
    handleAddImage,
    handleAddFile,
    handleAddPhotoFromCamera
  }
}
