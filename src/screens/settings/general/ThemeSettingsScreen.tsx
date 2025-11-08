import { RadioGroup } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Uniwind } from 'uniwind'

import { Container, Group, HeaderBar, SafeAreaContainer, Text, XStack } from '@/componentsV2'
import { themeOptions } from '@/config/theme'
import { useSettings } from '@/hooks/useSettings'
import { ThemeMode } from '@/types'

export default function ThemeSettingsScreen() {
  const { t } = useTranslation()
  const { theme: currentTheme, setTheme: setCurrentTheme } = useSettings()
  const changeTheme = (theme: string) => {
    switch (theme) {
      case 'light':
        setCurrentTheme(ThemeMode.light)
        Uniwind.setTheme('light')
        break
      case 'dark':
        setCurrentTheme(ThemeMode.dark)
        Uniwind.setTheme('dark')
        break
      case 'system':
        setCurrentTheme(ThemeMode.system)
        Uniwind.setTheme('system')
        break
    }
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.general.theme.title')} />
      <Container>
        <Group className="gap-3 px-4">
          <RadioGroup value={currentTheme} onValueChange={value => changeTheme(value)} className="gap-3">
            {themeOptions.map(opt => (
              <RadioGroup.Item key={opt.value} value={opt.value} className="rounded-xl p-4">
                <XStack className="flex-1 items-center justify-between">
                  <Text className="text-base">{t(opt.label)}</Text>
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
