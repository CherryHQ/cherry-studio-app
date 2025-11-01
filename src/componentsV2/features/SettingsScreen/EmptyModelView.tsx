import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import YStack from '@/componentsV2/layout/YStack'

export const EmptyModelView: React.FC = () => {
  const { t } = useTranslation()

  return (
    <YStack className="w-full items-center gap-12">
      <YStack className="gap-3">
        <Text className="text-center text-3xl font-bold text-text-primary dark:text-text-primary-dark">
          {t('settings.models.empty.label')}
        </Text>
      </YStack>
    </YStack>
  )
}
