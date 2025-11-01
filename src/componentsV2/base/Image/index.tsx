import { cn } from 'heroui-native'
import React, { forwardRef } from 'react'
import type { ImageProps as RNImageProps } from 'react-native'
import { Animated, Image as RNImage } from 'react-native'

export interface ImageProps extends RNImageProps {
  className?: string
}

const Image = forwardRef<RNImage, ImageProps>(({ className = '', ...rest }, ref) => {
  const composed = cn(className)

  return <RNImage ref={ref} className={composed} {...rest} />
})

Image.displayName = 'Image'

export const AnimatedImage = Animated.createAnimatedComponent(Image)

export default Image
