import { useNavigation } from '@react-navigation/native'
import { RadioGroup } from 'heroui-native'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Container, Group, HeaderBar, SafeAreaContainer, Text, XStack } from '@/componentsV2'
import { defaultLanguage, languagesOptions } from '@/config/languages'
import { useBuiltInAssistants } from '@/hooks/useAssistant'
import type { GeneralSettingsNavigationProps } from '@/types/naviagate'
import { storage } from '@/utils'

export default function LanguageChangeScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<GeneralSettingsNavigationProps>()
  const [currentLanguage, setCurrentLanguage] = useState<string>(storage.getString('language') || defaultLanguage)
  const { resetBuiltInAssistants } = useBuiltInAssistants()

  const changeLanguage = async (langCode: string) => {
    storage.set('language', langCode)
    await i18n.changeLanguage(langCode)
    setCurrentLanguage(langCode)
    navigation.goBack()
  }

  const handleLanguageChange = async (langCode: string) => {
    await changeLanguage(langCode)
    resetBuiltInAssistants()
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.general.language.title')} />
      <Container>
        <Group className="gap-3 px-4">
          <RadioGroup value={currentLanguage} onValueChange={value => handleLanguageChange(value)} className="gap-3">
            {languagesOptions.map(opt => (
              <RadioGroup.Item key={opt.value} value={opt.value} className="bg-ui-card-background rounded-xl p-4">
                <XStack className="flex-1 items-center justify-between">
                  <XStack className="items-center gap-3">
                    <Text className="text-base">{opt.flag}</Text>
                    <Text className="text-base">{opt.label}</Text>
                  </XStack>
                  <RadioGroup.Indicator>
                    <RadioGroup.IndicatorThumb />
                  </RadioGroup.Indicator>
                </XStack>
              </RadioGroup.Item>
            ))}
          </RadioGroup>
        </Group>
      </Container>
    </SafeAreaContainer>
  )
}
