import React from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'

import { Image, ImageGalleryViewer } from '@/componentsV2'
import { ImageOff } from '@/componentsV2/icons/LucideIcon'

interface MarkdownImageProps {
  src?: string
  alt?: string
}

export function MarkdownImage({ src, alt }: MarkdownImageProps) {
  const [visible, setVisible] = React.useState(false)
  const [imageError, setImageError] = React.useState(false)
  const { width: screenWidth } = useWindowDimensions()

  if (!src) return null

  const imageWidth = (screenWidth - 24) * 0.3

  return (
    <View className="aspect-square w-1/3">
      <Pressable
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        onPress={() => !imageError && setVisible(true)}
        disabled={imageError}>
        {imageError ? (
          <View
            className="bg-gray-5 rounded-2.5 items-center justify-center"
            style={{ width: imageWidth, height: imageWidth }}>
            <ImageOff size={imageWidth * 0.3} className="text-zinc-400/20" />
          </View>
        ) : (
          <Image
            source={{ uri: src }}
            className="rounded-sm"
            style={{ width: imageWidth, height: imageWidth }}
            onError={() => setImageError(true)}
            accessibilityLabel={alt}
          />
        )}
      </Pressable>

      <ImageGalleryViewer images={[src]} initialIndex={0} visible={visible} onClose={() => setVisible(false)} />
    </View>
  )
}
