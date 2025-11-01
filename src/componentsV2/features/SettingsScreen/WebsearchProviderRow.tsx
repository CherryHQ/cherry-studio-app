import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import { WebsearchProviderIcon } from '@/componentsV2/icons'
import PressableRow from '@/componentsV2/layout/PressableRow'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import type { WebSearchNavigationProps } from '@/types/naviagate'
import type { WebSearchProvider } from '@/types/websearch'

interface WebsearchProviderRowProps {
  provider: WebSearchProvider
  // google, bing or baidu not need expended
  need_config?: boolean
}

export const WebsearchProviderRow = ({ provider, need_config }: WebsearchProviderRowProps) => {
  const { t } = useTranslation()
  const navigation = useNavigation<WebSearchNavigationProps>()

  const onPress = () => {
    if (!need_config) return
    navigation.navigate('WebSearchProviderSettingsScreen', { providerId: provider.id })
  }

  return (
    <PressableRow onPress={onPress} disabled={!need_config}>
      <XStack className="items-center gap-3">
        <WebsearchProviderIcon provider={provider} />
        <Text className="text-[14px] text-text-primary dark:text-text-primary-dark">{provider.name}</Text>
      </XStack>
      <XStack className="items-center gap-2">
        {provider.apiKey && (
          <Text className="rounded-lg border border-green-20 bg-green-10 px-2 py-0.5 text-xs text-green-100 dark:text-green-dark-100">
            {t('common.added')}
          </Text>
        )}
        {need_config && <RowRightArrow />}
      </XStack>
    </PressableRow>
  )
}
