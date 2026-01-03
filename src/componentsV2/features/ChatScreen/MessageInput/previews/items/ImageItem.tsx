import type { FC } from 'react'
import { useState } from 'react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import Image from '@/componentsV2/base/Image'
import ImageGalleryViewer from '@/componentsV2/base/ImageGalleryViewer'
import { Download, ImageOff } from '@/componentsV2/icons'
import { useToast } from '@/hooks/useToast'
import { saveImageToGallery } from '@/services/ImageService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'

import BaseItem from './BaseItem'

const logger = loggerService.withContext('Image Item')

interface ImageItemProps {
  file: FileMetadata
  allImages?: FileMetadata[]
  onRemove?: (file: FileMetadata) => void
  size?: number
  disabledContextMenu?: boolean
}

const ImageItem: FC<ImageItemProps> = ({ file, allImages = [], onRemove, size, disabledContextMenu }) => {
  const [visible, setIsVisible] = useState(false)
  const [imageError, setImageError] = useState(false)
  const imagesForViewer = allImages.length > 0 ? allImages : [file]
  const imageIndex = imagesForViewer.findIndex(img => img.path === file.path)
  const { t } = useTranslation()
  const toast = useToast()

  const handleImageError = () => {
    setImageError(true)
    logger.warn('Image failed to load:', file.path)
  }

  const handleSaveImage = async () => {
    try {
      const result = await saveImageToGallery(file.path)

      if (result.success) {
        toast.show(t('common.saved'))
        logger.info('Image saved successfully')
      } else {
        toast.show(result.message, { color: 'red', duration: 2500 })
        logger.warn('Failed to save image:', result.message)
      }
    } catch (error) {
      toast.show(t('common.error_occurred'), { color: 'red', duration: 2500 })
      logger.error('Error in handleSaveImage:', error)
    }
  }

  return (
    <>
      <BaseItem
        file={file}
        onRemove={onRemove}
        onPress={() => !imageError && setIsVisible(true)}
        size={size}
        disabledContextMenu={disabledContextMenu || imageError}
        hasError={imageError}
        renderErrorPlaceholder={width => (
          <View className="bg-gray-5 rounded-2.5 items-center justify-center" style={{ width, height: width }}>
            <ImageOff size={width * 0.3} className="text-zinc-400/20" />
          </View>
        )}
        renderContent={({ width }) => (
          <Image
            style={{ width, height: width }}
            source={{ uri: file.path }}
            className="rounded-2xl"
            onError={handleImageError}
          />
        )}
        extraMenuItems={[
          {
            title: t('button.save_image'),
            iOSIcon: 'square.and.arrow.down',
            androidIcon: <Download size={16} className="text-foreground" />,
            onSelect: handleSaveImage
          }
        ]}
      />
      <ImageGalleryViewer
        images={imagesForViewer.map(f => f.path)}
        initialIndex={imageIndex >= 0 ? imageIndex : 0}
        visible={visible}
        onClose={() => setIsVisible(false)}
      />
    </>
  )
}

export default ImageItem
