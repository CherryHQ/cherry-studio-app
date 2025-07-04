import { CirclePlus } from '@tamagui/lucide-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import React from 'react'
import { Button } from 'tamagui'

import { uploadFiles } from '@/services/FileService'
import { FileType } from '@/types/file'
import { uuid } from '@/utils'
import { getFileType } from '@/utils/file'

interface AddFileButtonProps {
  files: FileType[]
  setFiles: (files: FileType[]) => void
}

export const AddFileButton: React.FC<AddFileButtonProps> = ({ files, setFiles }) => {
  const handleAddImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true
      })

      if (result.canceled) {
        console.log('Image selection was canceled')
        return
      }

      const _files: Omit<FileType, 'md5'>[] = result.assets.map(asset => {
        const id = uuid()
        return {
          id: id,
          name: asset.fileName || id,
          origin_name: asset.fileName || id,
          path: asset.uri,
          size: asset.fileSize || 0,
          ext: asset.fileName?.split('.').pop() || 'png',
          type: getFileType(asset.fileName?.split('.').pop() || 'png'),
          mime_type: asset.mimeType || '',
          created_at: new Date().toISOString(),
          count: 1
        }
      })
      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
    } catch (error) {
      console.error('Error selecting image:', error)
    }
  }

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true })

      if (result.canceled) {
        console.log('File selection was canceled')
        return
      }

      const _files: Omit<FileType, 'md5'>[] = result.assets.map(asset => {
        return {
          id: uuid(),
          name: asset.name,
          origin_name: asset.name,
          path: asset.uri,
          size: asset.size || 0,
          ext: asset.name.split('.').pop() || '',
          type: getFileType(asset.name.split('.').pop() || ''),
          mime_type: asset.mimeType || '',
          created_at: new Date().toISOString(),
          count: 1
        }
      })
      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
    } catch (error) {
      console.error('Error selecting file:', error)
    }
  }

  const handleAddPress = async () => {
    // await handleAddImage()
    await handleAddFile()
  }

  return <Button chromeless size={24} icon={<CirclePlus size={24} />} onPress={handleAddPress} />
}
