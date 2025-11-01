import React from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { TouchableOpacity } from 'react-native'

interface IconButtonProps {
  onPress?: () => void
  icon: React.ReactNode
  style?: StyleProp<ViewStyle>
  disabled?: boolean
}

export const IconButton = ({ onPress, icon, style, disabled }: IconButtonProps) => {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} style={style} disabled={disabled}>
      {icon}
    </TouchableOpacity>
  )
}
