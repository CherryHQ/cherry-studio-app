import { useFocusEffect, useNavigation } from '@react-navigation/native'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Container,
  Group,
  GroupTitle,
  HeaderBar,
  PressableRow,
  RowRightArrow,
  SafeAreaContainer,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { languagesOptions } from '@/config/languages'
import { useTheme } from '@/hooks/useTheme'
import type { GeneralSettingsNavigationProps } from '@/types/naviagate'
import { storage } from '@/utils'

export default function GeneralSettingsScreen() {
  const { t, i18n } = useTranslation()

  const [language, setLanguage] = useState('zh-CN')
  const { themeSetting } = useTheme()

  const navigation = useNavigation<GeneralSettingsNavigationProps>()

  const handleFocus = useCallback(() => {
    const loadSettings = async () => {
      const storedLanguage = storage.getString('language')

      if (storedLanguage) {
        setLanguage(storedLanguage)
      } else {
        setLanguage(i18n.language)
      }
    }

    loadSettings()
  }, [i18n.language])

  useFocusEffect(handleFocus)

  const getCurrentLanguage = () => {
    const currentLang = languagesOptions.find(item => item.value === language)
    return currentLang ? `${currentLang.flag} ${currentLang.label}` : 'English'
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.general.title')} />
      <Container>
        <YStack className="flex-1 gap-6">
          {/* Display settings */}
          <YStack className="gap-2">
            <GroupTitle>{t('settings.general.display.title')}</GroupTitle>
            <Group>
              <PressableRow onPress={() => navigation.navigate('ThemeSettingsScreen')}>
                <XStack className="items-center">
                  <Text className="text-lg">{t('settings.general.theme.title')}</Text>
                </XStack>
                <XStack className="items-center gap-2">
                  <Text className="text-gray-500">
                    {t(`settings.general.theme.${themeSetting === 'system' ? 'auto' : themeSetting}`)}
                  </Text>
                  <RowRightArrow />
                </XStack>
              </PressableRow>
            </Group>
          </YStack>

          {/* General settings */}
          <YStack className="gap-2">
            <GroupTitle>{t('settings.general.title')}</GroupTitle>
            <Group>
              <PressableRow onPress={() => navigation.navigate('LanguageChangeScreen')}>
                <XStack className="items-center">
                  <Text className="text-lg">{t('settings.general.language.title')}</Text>
                </XStack>
                <XStack className="items-center gap-2">
                  <Text>{getCurrentLanguage()}</Text>
                  <RowRightArrow />
                </XStack>
              </PressableRow>
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
