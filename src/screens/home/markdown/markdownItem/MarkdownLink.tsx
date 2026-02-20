import type { ReactNode } from 'react'
import React from 'react'
import { Linking, Text } from 'react-native'

import { loggerService } from '@/services/LoggerService'

import { StyledText } from './MarkdownText'

const logger = loggerService.withContext('MarkdownLink')

interface MarkdownLinkProps {
  href?: string
  children: ReactNode
}

export function MarkdownLink({ href, children }: MarkdownLinkProps) {
  const handlePress = async () => {
    if (!href) return
    try {
      const canOpen = await Linking.canOpenURL(href)
      if (canOpen) {
        await Linking.openURL(href)
      }
    } catch (error) {
      logger.warn('Failed to open URL', { href, error })
    }
  }

  return (
    <StyledText className="text-primary text-base underline" onPress={handlePress}>
      {children}
    </StyledText>
  )
}
