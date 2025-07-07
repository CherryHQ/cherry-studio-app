import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { useTheme, XStack, YStack } from 'tamagui'

import { SettingContainer, SettingGroupTitle } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'

export default function ObsidianSettingsScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation()

  const handleBackPress = () => {
    navigation.goBack()
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t('settings.obsidian.title')} onBackPress={handleBackPress} />
      <SettingContainer>
        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.obsidian.default_vault')}</SettingGroupTitle>
          </XStack>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <Text>{t('settings.obsidian.default_vault_no_vaults')}</Text>
          </XStack>
        </YStack>
      </SettingContainer>
    </SafeAreaContainer>
  )
}
