import { cn } from 'heroui-native'
import React, { forwardRef } from 'react'
import type { ViewProps } from 'react-native'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'

export interface YStackProps extends ViewProps {
  className?: string
}

const YStack = forwardRef<View, YStackProps>(({ className = '', ...rest }, ref) => {
  const composed = cn('flex-col', className)

  return <View ref={ref} className={composed} {...rest} />
})

YStack.displayName = 'YStack'

export const AnimatedYStack = Animated.createAnimatedComponent(YStack)

export default YStack
