import { useNavigation } from '@react-navigation/native'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { ScrollView, useTheme, YStack } from 'tamagui'

import { SettingContainer } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { loggerService } from '@/services/LoggerService'
import { NavigationProps } from '@/types/naviagate'
import { SubscribeSource } from '@/types/websearch'

import BlacklistSettings from './BlacklistSettings'
import GeneralSettings from './GeneralSettings'
import ProviderSettings from './ProviderSettings'
const logger = loggerService.withContext('WebSearchSettingsScreen')

const blacklistSubscription: SubscribeSource[] = [{ key: 1, url: 'https://git.io/ublacklist', name: 'git.io' }]

export default function WebSearchSettingsScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation<NavigationProps>()

  // General settings state
  const [searchWithDates, setSearchWithDates] = useState<boolean>(true)
  const [overrideSearchService, setOverrideSearchService] = useState<boolean>(true)
  const [searchCount, setSearchCount] = useState<number>(6)
  const [contentLimit, setContentLimit] = useState<string>('2000')

  // Blacklist state
  const [blacklistText, setBlacklistText] = useState<string>('')

  // General settings handlers
  const handleSearchCountChange = (value: number[]) => {
    setSearchCount(value[0])
  }

  // Blacklist handlers
  const handleRefreshSubscription = (subscribe: SubscribeSource) => {
    logger.info('Refreshing subscription for:', subscribe)
  }

  const handleRefreshAllSubscriptions = () => {
    logger.info('Refreshing all subscriptions')
  }

  const handleAddSubscription = () => {
    logger.info('Adding new subscription')
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <HeaderBar title={t('settings.websearch.title')} onBackPress={() => navigation.goBack()} />
        <ScrollView flex={1}>
          <SettingContainer>
            <YStack gap={24} flex={1}>
              <ProviderSettings />

              <GeneralSettings
                searchWithDates={searchWithDates}
                onSearchWithDatesChange={setSearchWithDates}
                overrideSearchService={overrideSearchService}
                onOverrideSearchServiceChange={setOverrideSearchService}
                searchCount={searchCount}
                onSearchCountChange={handleSearchCountChange}
                contentLimit={contentLimit}
                onContentLimitChange={setContentLimit}
              />

              <BlacklistSettings
                blacklistText={blacklistText}
                onBlacklistTextChange={setBlacklistText}
                subscriptions={blacklistSubscription}
                onRefreshSubscription={handleRefreshSubscription}
                onRefreshAllSubscriptions={handleRefreshAllSubscriptions}
                onAddSubscription={handleAddSubscription}
              />
            </YStack>
          </SettingContainer>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaContainer>
  )
}
