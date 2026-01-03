import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { PenLine, X } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'

interface EditingPreviewProps {
  onCancel: () => void
}

export const EditingPreview: React.FC<EditingPreviewProps> = ({ onCancel }) => {
  const { t } = useTranslation()

  return (
    <XStack>
      <XStack className="message-input-container items-center justify-between gap-1 rounded-full border px-2 py-1">
        <PenLine size={20} className="primary-text" />
        <Text className="primary-text">{t('message.editing_message')}</Text>
        <Pressable onPress={onCancel}>
          <X size={20} className="primary-text" />
        </Pressable>
      </XStack>
    </XStack>
  )
}
