import { cn } from 'heroui-native'
import React, { forwardRef } from 'react'
import type { ViewProps } from 'react-native'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'

export interface XStackProps extends ViewProps {
  className?: string
}

const XStack = forwardRef<View, XStackProps>(({ className = '', ...rest }, ref) => {
  const composed = cn('flex-row', className)

  return <View ref={ref} className={composed} {...rest} />
})

XStack.displayName = 'XStack'

export const AnimatedXStack = Animated.createAnimatedComponent(XStack)

export default XStack
