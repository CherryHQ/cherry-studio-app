import React from 'react'
import { Pressable } from 'react-native'

import { Menu } from '@/componentsV2/icons/LucideIcon'

interface MenuButtonProps {
  onMenuPress: () => void
}

export const MenuButton = ({ onMenuPress }: MenuButtonProps) => {
  return (
    <Pressable
      onPress={onMenuPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className="h-6 w-6 items-center justify-center rounded-full">
      <Menu size={24} />
    </Pressable>
  )
}
