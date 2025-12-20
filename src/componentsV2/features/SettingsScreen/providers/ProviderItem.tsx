import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ProviderIcon } from '@/componentsV2/icons'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import type { Provider } from '@/types/assistant'
import type { ProvidersNavigationProps } from '@/types/naviagate'

interface ProviderItemProps {
  provider: Provider
  mode?: 'enabled' | 'checked' // Add mode prop to distinguish display modes
  onEdit?: (provider: Provider) => void
}

export const ProviderItem: React.FC<ProviderItemProps> = ({ provider, mode = 'enabled' }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<ProvidersNavigationProps>()

  // Determine display conditions and text based on mode
  const shouldShowStatus = mode === 'enabled' ? provider.enabled : provider.apiKey
  const statusText = mode === 'enabled' ? t('settings.provider.enabled') : t('settings.provider.added')

  const handlePress = () => {
    navigation.navigate('ProviderSettingsScreen', { providerId: provider.id })
  }

  return (
    <Pressable onPress={handlePress}>
      <XStack className="items-center justify-between px-4 py-3">
        <XStack className="items-center gap-2">
          <ProviderIcon provider={provider} />
          <Text className="text-foreground text-lg">
            {t(`provider.${provider.id}`, { defaultValue: provider.name })}
          </Text>
        </XStack>
        <XStack className="items-center gap-2.5">
          {shouldShowStatus && (
            <Text className="primary-badge rounded-lg border-[0.5px] px-2 py-0.5 text-sm">{statusText}</Text>
          )}
          <RowRightArrow />
        </XStack>
      </XStack>
    </Pressable>
  )
}
