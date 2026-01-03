import { GlassView } from 'expo-glass-effect'
import { Button, cn } from 'heroui-native'
import React, { type ReactNode } from 'react'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'

import { isIOS26 } from '@/utils/device'

interface LiquidGlassButtonProps {
  onPress?: () => void
  children: ReactNode
  size?: number
  className?: string
  style?: StyleProp<ViewStyle>
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'danger-soft'
}

export const LiquidGlassButton = ({
  onPress,
  children,
  className,
  style,
  size,
  variant = 'tertiary'
}: LiquidGlassButtonProps) => {
  if (isIOS26) {
    return (
      <GlassView
        isInteractive
        style={[
          {
            width: size,
            height: size,
            borderRadius: 99,
            justifyContent: 'center',
            alignItems: 'center'
          },
          style
        ]}>
        <Pressable
          onPress={onPress}
          style={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
          {children}
        </Pressable>
      </GlassView>
    )
  }

  return (
    <Button
      onPress={onPress}
      className={cn('bg-secondary h-10 w-10 items-center justify-center rounded-full', className)}
      variant={variant}
      style={style}>
      {children}
    </Button>
  )
}
