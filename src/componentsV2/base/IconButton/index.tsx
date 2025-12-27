import React from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Pressable } from 'react-native'

interface IconButtonProps {
  onPress?: () => void
  icon: React.ReactNode
  style?: StyleProp<ViewStyle>
  disabled?: boolean
}

export const IconButton = ({ onPress, icon, style, disabled }: IconButtonProps) => {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}
      disabled={disabled}>
      {icon}
    </Pressable>
  )
}
