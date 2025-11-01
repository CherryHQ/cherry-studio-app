import { cn } from 'heroui-native'
import React, { forwardRef } from 'react'
import type { TextProps as RNTextProps } from 'react-native'
import { Text as RNText } from 'react-native'

export interface TextProps extends RNTextProps {
  className?: string
}

const Text = forwardRef<RNText, TextProps>(({ className = '', ...rest }, ref) => {
  const composed = cn('text-base text-text-primary dark:text-text-primary-dark', className)

  return <RNText ref={ref} className={composed} {...rest} />
})

Text.displayName = 'Text'

export default Text
