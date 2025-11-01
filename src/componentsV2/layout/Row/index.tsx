import React from 'react'
import { ViewProps } from 'react-native'
import XStack from '../XStack'

export interface RowProps extends ViewProps {
  className?: string
}

const Row: React.FC<RowProps> = ({ className, children, ...props }) => {
  return (
    <XStack className={`items-center justify-between px-4 py-[14px] ${className || ''}`} {...props}>
      {children}
    </XStack>
  )
}

export default Row
