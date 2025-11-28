import React from 'react'
import { useTranslation } from 'react-i18next'

import { Container, Group, GroupTitle, HeaderBar, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { LanguageDropdown } from '@/componentsV2/features/SettingsScreen/LanguageDropdown'
import { ThemeDropdown } from '@/componentsV2/features/SettingsScreen/ThemeDropdown'

export default function GeneralSettingsScreen() {
  const { t } = useTranslation()

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.general.title')} />
      <Container>
        <YStack className="flex-1 gap-6">
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

          {/* Privacy settings */}
          {/*<YStack gap={8}>
            <SettingGroupTitle>{t('settings.general.display.title')}</SettingGroupTitle>
            <SettingGroup>
              <SettingRow>
                <XStack alignItems="center">
                  <Text fontSize="$5">{t('settings.general.privacy.anonymous')}</Text>
                </XStack>
                <CustomSwitch />
              </SettingRow>
            </SettingGroup>
          </YStack>*/}
        </YStack>
      </Container>
    </SafeAreaContainer>
  )
}
