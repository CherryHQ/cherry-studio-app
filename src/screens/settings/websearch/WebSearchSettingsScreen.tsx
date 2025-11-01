import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { Container, HeaderBar, SafeAreaContainer, YStack } from '@/componentsV2'

import GeneralSettings from './GeneralSettings'
import ProviderSettings from './ProviderSettings'

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation()

  return (
    <SafeAreaContainer className="flex-1">
      <KeyboardAwareScrollView scrollEnabled={false} bottomOffset={40} className="flex-1">
        <HeaderBar title={t('settings.websearch.title')} />
        <View className="flex-1">
          <Container>
            <YStack className="flex-1 gap-6">
              <ProviderSettings />

              <GeneralSettings />
            </YStack>
          </Container>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaContainer>
  )
}
