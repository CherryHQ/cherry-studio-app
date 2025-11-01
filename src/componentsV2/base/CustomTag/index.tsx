import { cn } from 'heroui-native'
import React from 'react'

import XStack from '@/componentsV2/layout/XStack'

import Text from '../Text'

interface CustomTagProps {
  size?: number
  /** @deprecated use backgroundClassName instead */
  color?: string
  backgroundClassName?: string
  textClassName?: string
  icon?: React.ReactNode
  tooltip?: string
  children?: React.ReactNode
  className?: string
}

export const CustomTag: React.FC<CustomTagProps> = ({
  size = 12,
  color,
  backgroundClassName,
  textClassName,
  icon,
  children,
  className
}) => {
  const fontSize = Math.max(size - 2, 10)
  const padding = Math.max(size / 3, 4)
  const borderRadius = size / 2

  const resolvedBackground = backgroundClassName || color || 'bg-background-primary dark:bg-background-primary-dark'
  const textClasses = cn('font-medium text-text-primary dark:text-text-primary-dark', textClassName)

  return (
    <XStack
      className={cn('items-center gap-1', resolvedBackground, className)}
      style={{
        borderRadius,
        paddingHorizontal: padding,
        paddingVertical: 2
      }}>
      {icon}
      {children ? (
        <Text className={textClasses} style={{ fontSize }} numberOfLines={1}>
          {children}
        </Text>
      ) : null}
    </XStack>
  )
}
