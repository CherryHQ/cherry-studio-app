import React from 'react'
import { TouchableOpacity, TouchableOpacityProps } from 'react-native'
import XStack from '../XStack'

export interface PressableRowProps extends TouchableOpacityProps {
  className?: string
}

const PressableRow: React.FC<PressableRowProps> = ({ className, children, ...props }) => {
  return (
    <TouchableOpacity {...props}>
      <XStack className={`items-center justify-between px-4 py-[14px] ${className || ''}`}>{children}</XStack>
    </TouchableOpacity>
  )
}

export default PressableRow
