import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import PressableRow from '@/componentsV2/layout/PressableRow'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import type { SpeechToTextNavigationProps } from '@/types/naviagate'
import type { SpeechToTextProvider } from '@/types/speechToText'

interface SpeechToTextProviderRowProps {
  provider: SpeechToTextProvider
  need_config?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

export const SpeechToTextProviderRow = ({
  provider,
  need_config,
  isSelected,
  onSelect
}: SpeechToTextProviderRowProps) => {
  const { t } = useTranslation()
  const navigation = useNavigation<SpeechToTextNavigationProps>()

  const needConfig = need_config ?? provider.type === 'api'

  const onPress = () => {
    if (!needConfig) return
    navigation.navigate('SpeechToTextProviderSettingsScreen', { providerId: provider.id })
  }

  return (
    <PressableRow onPress={onPress}>
      <XStack className="items-center gap-3">
        <Text className="text-foreground text-[14px]">{t(`settings.speechToText.provider.${provider.id}`)}</Text>
      </XStack>
      <XStack className="items-center gap-2">
        {provider.apiKey && provider.apiKey.length > 0 && (
          <Text className="primary-badge rounded-lg border px-2 py-0.5 text-xs">{t('common.added')}</Text>
        )}
        {needConfig && <RowRightArrow />}
      </XStack>
    </PressableRow>
  )
}
