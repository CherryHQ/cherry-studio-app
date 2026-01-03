import React from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { Keyboard, Pressable, StyleSheet } from 'react-native'

import { Maximize2 } from '@/componentsV2/icons'

interface ExpandButtonProps {
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

export const ExpandButton: React.FC<ExpandButtonProps> = ({ onPress, style }) => {
  const handlePress = () => {
    Keyboard.dismiss()
    onPress()
  }

  return (
    <Pressable
      className="active:opacity-50"
      style={[styles.button, style]}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Maximize2 size={16} className="text-foreground/50" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
    zIndex: 10
  }
})
