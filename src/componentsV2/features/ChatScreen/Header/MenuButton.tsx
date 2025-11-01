import React from 'react'
import { TouchableOpacity } from 'react-native'

import { Menu } from '@/componentsV2/icons/LucideIcon'

interface MenuButtonProps {
  onMenuPress: () => void
}

export const MenuButton = ({ onMenuPress }: MenuButtonProps) => {
  return (
    <TouchableOpacity
      onPress={onMenuPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      className="h-6 w-6 items-center justify-center rounded-full">
      <Menu size={24} />
    </TouchableOpacity>
  )
}
