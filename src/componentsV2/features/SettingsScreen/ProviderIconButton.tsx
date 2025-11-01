import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity } from 'react-native'

import Image from '@/componentsV2/base/Image'
import { DefaultProviderIcon, PenLine } from '@/componentsV2/icons'
import YStack from '@/componentsV2/layout/YStack'
import { useDialog } from '@/hooks/useDialog'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { getFileType } from '@/utils/file'

const logger = loggerService.withContext('ProviderIconButton')

// Constants for image validation
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_FORMATS = ['png', 'jpg', 'jpeg']

interface ProviderIconButtonProps {
  providerId: string
  iconUri?: string
  onImageSelected?: (file: Omit<FileMetadata, 'md5'> | null) => void
}

// Helper function to create file from image asset
const createFileFromImageAsset = (
  asset: ImagePicker.ImagePickerAsset,
  providerId: string
): Omit<FileMetadata, 'md5'> => {
  const ext = asset.fileName?.split('.').pop() || 'png'

  return {
    id: providerId,
    name: asset.fileName || providerId,
    origin_name: asset.fileName || providerId,
    path: asset.uri,
    size: asset.fileSize || 0,
    ext,
    type: getFileType(ext),
    created_at: Date.now(),
    count: 1
  }
}

// Helper function to validate image
const validateImage = (asset: ImagePicker.ImagePickerAsset): string | null => {
  const ext = asset.fileName?.split('.').pop()?.toLowerCase()

  if (ext && !ALLOWED_FORMATS.includes(ext)) {
    return 'Invalid image format. Please use PNG, JPG, or JPEG.'
  }

  if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
    return 'Image size is too large. Please use an image smaller than 5MB.'
  }

  return null
}

export function ProviderIconButton({ providerId, iconUri, onImageSelected }: ProviderIconButtonProps) {
  const { t } = useTranslation()
  const dialog = useDialog()
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    if (!iconUri) {
      setImage(null)
      return
    }

    setImage(iconUri)
  }, [iconUri])

  const handleUploadIcon = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // Force square aspect ratio
        quality: 0.8
      })

      if (result.canceled) return

      const asset = result.assets[0]
      const validationError = validateImage(asset)

      if (validationError) {
        dialog.open({
          type: 'error',
          title: t('common.error'),
          content: validationError
        })
        return
      }

      setImage(asset.uri)
      const file = createFileFromImageAsset(asset, providerId)
      onImageSelected?.(file)
    } catch (error) {
      logger.error('handleUploadIcon Error', error)
      dialog.open({
        type: 'error',
        title: t('common.error_occurred'),
        content: 'Failed to upload image. Please try again.'
      })
    }
  }

  return (
    <YStack className="relative">
      <TouchableOpacity
        onPress={handleUploadIcon}
        className="h-[120px] w-[120px] overflow-hidden rounded-full border-[5px] border-green-100"
        style={{ justifyContent: 'center', alignItems: 'center' }}>
        {image ? (
          <Image source={{ uri: image }} className="h-[120px] w-[120px]" style={{ width: 120, height: 120 }} />
        ) : (
          <YStack className="boder-white h-full w-full border pl-5 pt-3">
            <DefaultProviderIcon />
          </YStack>
        )}
      </TouchableOpacity>

      <YStack className="absolute bottom-0 right-0 z-10 h-10 w-10 rounded-full">
        <LinearGradient
          colors={['#81df94', '#00B96B']}
          start={[1, 1]}
          end={[0, 0]}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center'
          }}>
          <PenLine size={24} color="white" />
        </LinearGradient>
      </YStack>
    </YStack>
  )
}
