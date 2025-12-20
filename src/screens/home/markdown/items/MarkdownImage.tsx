import React from 'react'
import { TouchableOpacity, useWindowDimensions, View } from 'react-native'

import { Image, ImageGalleryViewer } from '@/componentsV2'
import { ImageOff } from '@/componentsV2/icons/LucideIcon'

export interface MarkdownImageProps {
  uri: string
  alt?: string
}

const MarkdownImage: React.FC<MarkdownImageProps> = ({ uri, alt }) => {
  const [visible, setVisible] = React.useState(false)
  const [imageError, setImageError] = React.useState(false)
  const { width: screenWidth } = useWindowDimensions()

  // Default size similar to ImageItem: ~30% of screen width
  const imageWidth = (screenWidth - 24) * 0.3

  return (
    <View className="aspect-square w-1/3">
      <TouchableOpacity activeOpacity={0.8} onPress={() => !imageError && setVisible(true)} disabled={imageError}>
        {imageError ? (
          <View
            className="bg-gray-5 rounded-2.5 items-center justify-center"
            style={{ width: imageWidth, height: imageWidth }}>
            <ImageOff size={imageWidth * 0.3} className="text-zinc-400/20" />
          </View>
        ) : (
          <Image
            source={{ uri }}
            className="rounded-sm"
            style={{ width: imageWidth, height: imageWidth }}
            onError={() => setImageError(true)}
            accessibilityLabel={alt}
          />
        )}
      </TouchableOpacity>

      <ImageGalleryViewer images={[uri]} initialIndex={0} visible={visible} onClose={() => setVisible(false)} />
    </View>
  )
}

export default MarkdownImage
