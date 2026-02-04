import { Switch } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { Container, Group, GroupTitle, HeaderBar, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { LanguageDropdown } from '@/componentsV2/features/SettingsScreen/general/LanguageDropdown'
import { TabletSidebarPositionDropdown } from '@/componentsV2/features/SettingsScreen/general/TabletSidebarPositionDropdown'
import { ThemeDropdown } from '@/componentsV2/features/SettingsScreen/general/ThemeDropdown'
import { usePreference } from '@/hooks/usePreference'
import { useResponsive } from '@/hooks/useResponsive'

export default function GeneralSettingsScreen() {
  const { t } = useTranslation()
  const { isTablet } = useResponsive()
  const [developerMode, setDeveloperMode] = usePreference('app.developer_mode')

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.general.title')} />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <YStack className="gap-6">
          {/* Display settings */}
          <YStack className="gap-2">
            <GroupTitle>{t('settings.general.display.title')}</GroupTitle>
            <Group>
              <XStack className="items-center justify-between p-4">
                <Text className="text-lg">{t('settings.general.theme.title')}</Text>
                <ThemeDropdown />
              </XStack>
            </Group>
          </YStack>

          {/* General settings */}
          <YStack className="gap-2">
            <GroupTitle>{t('settings.general.title')}</GroupTitle>
            <Group>
              <XStack className="items-center justify-between p-4">
                <Text className="text-lg">{t('settings.general.language.title')}</Text>
                <LanguageDropdown />
              </XStack>
            </Group>
          </YStack>

          {/* Developer settings */}
          <YStack className="gap-2">
            <GroupTitle>{t('settings.general.developer_mode.title')}</GroupTitle>
            <Group>
              <XStack className="items-center justify-between p-4">
                <Text className="text-lg">{t('settings.general.developer_mode.title')}</Text>
                <Switch isSelected={developerMode} onSelectedChange={setDeveloperMode} />
              </XStack>
            </Group>
          </YStack>
        </YStack>
      </ScrollView>
    </SafeAreaContainer>
  )
}
