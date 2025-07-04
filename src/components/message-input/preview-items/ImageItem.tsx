import { X } from '@tamagui/lucide-icons'
import { FC, useState } from 'react'
import React from 'react'
import { TouchableOpacity } from 'react-native'
import ImageView from 'react-native-image-viewing'
import { Image, Stack, useWindowDimensions, View } from 'tamagui'

import { FileType } from '@/types/file'

interface ImageItemProps {
  file: FileType
  allImages?: FileType[]
  onRemove?: (file: FileType) => void
  size?: number
}

const ImageItem: FC<ImageItemProps> = ({ file, allImages = [], onRemove, size }) => {
  const [visible, setIsVisible] = useState(false)
  const imagesForViewer = allImages.length > 0 ? allImages : [file]
  const imageIndex = imagesForViewer.findIndex(img => img.path === file.path)
  const { width: screenWidth } = useWindowDimensions()
  // Default size is 30% of the screen width, (32 is the padding on both sides)
  const imageWidth = size ? size : (screenWidth - 32) * 0.3

  const handleRemove = e => {
    e.stopPropagation()
    onRemove?.(file)
  }

  return (
    <View style={{ position: 'relative' }}>
      <TouchableOpacity onPress={() => setIsVisible(true)}>
        <Image source={{ uri: file.path, width: imageWidth, height: imageWidth }} style={{ borderRadius: 8 }} />
      </TouchableOpacity>
      <ImageView
        images={imagesForViewer.map(f => ({ uri: f.path }))}
        imageIndex={imageIndex >= 0 ? imageIndex : 0}
        visible={visible}
        onRequestClose={() => setIsVisible(false)}
        presentationStyle="fullScreen"
        animationType="slide"
      />
      {onRemove && (
        <TouchableOpacity
          onPress={handleRemove}
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            borderRadius: 99
          }}>
          <Stack
            width={16}
            height={16}
            backgroundColor="rgba(255, 0, 0, 0.2)"
            borderRadius={99}
            alignItems="center"
            justifyContent="center">
            <X size={10} color="rgba(255, 0, 0, 1)" />
          </Stack>
        </TouchableOpacity>
      )}
    </View>
  )
}

export default ImageItem
