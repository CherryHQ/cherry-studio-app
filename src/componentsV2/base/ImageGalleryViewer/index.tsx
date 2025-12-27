import React, { useRef, useState } from 'react'
import { Modal, Platform, Pressable, View } from 'react-native'
import Gallery, { type GalleryRef } from 'react-native-awesome-gallery'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Image from '@/componentsV2/base/Image'
import { X } from '@/componentsV2/icons/LucideIcon'

import ImageViewerFooterComponent from '../ImageViewerFooterComponent'

export interface ImageGalleryViewerProps {
  images: string[]
  initialIndex?: number
  visible: boolean
  onClose: () => void
}

const ImageGalleryViewer: React.FC<ImageGalleryViewerProps> = ({ images, initialIndex = 0, visible, onClose }) => {
  const [showToolbar, setShowToolbar] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const galleryRef = useRef<GalleryRef>(null)
  const insets = useSafeAreaInsets()

  const handleTap = () => {
    setShowToolbar(prev => !prev)
  }

  const handleScaleChange = (scale: number) => {
    if (scale > 1 && showToolbar) {
      setShowToolbar(false)
    }
  }

  const handleIndexChange = (newIndex: number) => {
    setCurrentIndex(newIndex)
  }

  const currentUri = images[currentIndex] || images[0]

  const androidElevation = Platform.OS === 'android' ? { elevation: 10 } : {}

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <Gallery
          ref={galleryRef}
          data={images}
          initialIndex={initialIndex}
          onIndexChange={handleIndexChange}
          onSwipeToClose={onClose}
          onTap={handleTap}
          onScaleChange={handleScaleChange}
          renderItem={({ item, setImageDimensions }) => (
            <Image
              source={{ uri: item }}
              className="h-full w-full flex-1"
              resizeMode="contain"
              onLoad={e => {
                const { width, height } = e.nativeEvent.source
                setImageDimensions({ width, height })
              }}
            />
          )}
        />

        {showToolbar && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="absolute left-4 z-10"
            style={[{ top: insets.top + 16 }, androidElevation]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={28} color="white" />
            </Pressable>
          </Animated.View>
        )}

        {showToolbar && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="absolute bottom-0 left-0 right-0 z-10 pt-4"
            style={androidElevation}>
            <ImageViewerFooterComponent uri={currentUri} onSaved={onClose} />
          </Animated.View>
        )}
      </View>
    </Modal>
  )
}

export default ImageGalleryViewer
