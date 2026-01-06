import * as ImagePicker from 'expo-image-picker'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import Image from '@/componentsV2/base/Image'
import { DefaultProviderIcon, PenLine } from '@/componentsV2/icons'
import YStack from '@/componentsV2/layout/YStack'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { getFileExtension, getFileType } from '@/utils/file'

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
  const ext = getFileExtension(asset.fileName || '') || '.png'

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
  const ext = getFileExtension(asset.fileName || '')
  const extWithoutDot = ext ? ext.slice(1) : ''

  if (extWithoutDot && !ALLOWED_FORMATS.includes(extWithoutDot)) {
    return 'Invalid image format. Please use PNG, JPG, or JPEG.'
  }

  if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
    return 'Image size is too large. Please use an image smaller than 5MB.'
  }

  return null
}

export function ProviderIconButton({ providerId, iconUri, onImageSelected }: ProviderIconButtonProps) {
  const { t } = useTranslation()
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
        presentDialog('error', {
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
      presentDialog('error', {
        title: t('common.error_occurred'),
        content: 'Failed to upload image. Please try again.'
      })
    }
  }

  return (
    <YStack className="relative">
      <Pressable
        onPress={handleUploadIcon}
        className="primary-border h-[120px] w-[120px] overflow-hidden rounded-full border-[5px]"
        style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
        {image ? (
          <Image source={{ uri: image }} className="h-[120px] w-[120px]" />
        ) : (
          <YStack className="border-background h-full w-full border pl-5 pt-3">
            <DefaultProviderIcon />
          </YStack>
        )}
      </Pressable>

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
