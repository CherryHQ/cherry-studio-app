import { RadioGroup } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { Container, HeaderBar, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { themeOptions } from '@/config/theme'
import { useSettings } from '@/hooks/useSettings'

export default function ThemeSettingsScreen() {
  const { t } = useTranslation()
  const { theme: currentTheme, setTheme: setCurrentTheme } = useSettings()

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.general.theme.title')} />
      <Container>
        <YStack className="flex-1 gap-3 px-4">
          <RadioGroup
            value={currentTheme}
            onValueChange={value => setCurrentTheme(value as any).catch(console.error)}
            className="gap-3">
            {themeOptions.map(opt => (
              <RadioGroup.Item key={opt.value} value={opt.value} className="bg-ui-card-background rounded-xl p-4">
                <XStack className="flex-1 items-center justify-between">
                  <Text className="text-base">{t(opt.label)}</Text>
                  <RadioGroup.Indicator
                    className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                      currentTheme === opt.value ? 'border-gray-900' : 'border-gray-400'
                    }`}>
                    <RadioGroup.IndicatorThumb
                      className={`h-2.5 w-2.5 rounded-full ${
                        currentTheme === opt.value ? 'bg-gray-900' : 'bg-transparent'
                      }`}
                    />
                  </RadioGroup.Indicator>
                </XStack>
              </RadioGroup.Item>
            ))}
          </RadioGroup>
        </YStack>
      </Container>
    </SafeAreaContainer>
  )
}
