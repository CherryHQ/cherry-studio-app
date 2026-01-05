import type { ReactNode } from 'react'
import React from 'react'
import { Linking } from 'react-native'

import { loggerService } from '@/services/LoggerService'

import { StyledUITextView } from './MarkdownText'

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
    <StyledUITextView className="text-primary text-base underline" onPress={handlePress}>
      {children}
    </StyledUITextView>
  )
}
