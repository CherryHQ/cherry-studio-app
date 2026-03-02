import React from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { HeaderBar, SafeAreaContainer, YStack } from '@/componentsV2'

import GeneralSettings from './GeneralSettings'
import ProviderSettings from './ProviderSettings'

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation()

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.websearch.title')} />
      <KeyboardAwareScrollView bottomOffset={40} className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <YStack className="gap-6">
          <ProviderSettings />

          <GeneralSettings />
        </YStack>
      </KeyboardAwareScrollView>
    </SafeAreaContainer>
  )
}
