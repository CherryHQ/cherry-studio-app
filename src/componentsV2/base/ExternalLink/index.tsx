import * as ExpoLinking from 'expo-linking'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import { loggerService } from '@/services/LoggerService'

import Text from '../Text'
const logger = loggerService.withContext('External Link Component')

interface ExternalLinkProps {
  href: string
  content: string
}

export const ExternalLink: React.FC<ExternalLinkProps> = ({ href, content }) => {
  const { t } = useTranslation()

  const handlePress = async () => {
    const supported = await ExpoLinking.canOpenURL(href)

    if (supported) {
      try {
        await ExpoLinking.openURL(href)
      } catch (error) {
        const message = t('errors.cannotOpenLink', {
          error: error instanceof Error ? error.message : String(error)
        })
        logger.error('External Link Press', error)

        presentDialog('error', {
          title: t('errors.linkErrorTitle'),
          content: message
        })
      }
    } else {
      const message = t('errors.deviceCannotHandleLink', { href })
      logger.warn('External Link Not Supported', message)

      presentDialog('error', {
        title: t('errors.cannotOpenLinkTitle'),
        content: message
      })
    }
  }

  return (
    <Text className="text-xs text-blue-500" onPress={handlePress}>
      {content}
    </Text>
  )
}
