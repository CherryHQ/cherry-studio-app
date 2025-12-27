import type { ReactNode } from 'react'
import React from 'react'
import type { PressableProps } from 'react-native'
import { Pressable } from 'react-native'

import XStack from '../XStack'

export interface PressableRowProps extends Omit<PressableProps, 'children'> {
  className?: string
  children?: ReactNode
}

const PressableRow: React.FC<PressableRowProps> = ({ className, children, ...props }) => {
  return (
    <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })} {...props}>
      <XStack className={`items-center justify-between px-4 py-3.5 ${className || ''}`}>{children}</XStack>
    </Pressable>
  )
}

export default PressableRow
