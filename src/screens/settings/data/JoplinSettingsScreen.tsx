import BottomSheet from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { Eye, EyeOff, ShieldCheck } from '@tamagui/lucide-icons'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'
import { Button, Input, Stack, Text, useTheme, XStack, YStack } from 'tamagui'

import ExternalLink from '@/components/ExternalLink'
import { SettingContainer, SettingGroupTitle } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { ApiCheckSheet } from '@/components/settings/websearch/ApiCheckSheet'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { CustomSwitch } from '@/components/ui/Switch'

export default function JoplinSettingsScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation()

  const [showApiKey, setShowApiKey] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)

  const handleBackPress = () => {
    navigation.goBack()
  }

  const handleOpenBottomSheet = () => {
    bottomSheetRef.current?.expand()
    setIsBottomSheetOpen(true)
  }

  const handleBottomSheetClose = () => {
    setIsBottomSheetOpen(false)
  }

  const toggleApiKeyVisibility = () => {
    setShowApiKey(prevShowApiKey => !prevShowApiKey)
  }

  const handleProviderConfigChange = async (key: 'apiKey' | 'apiHost', value: string) => {
    console.log('Updating provider config:', key, value)
  }

  async function checkConnection() {
    setCheckLoading(true)

    try {
      console.log('Checking Joplin connection...')
      Alert.alert(t('settings.joplin.check.success'))
    } catch (error) {
      Alert.alert(t('settings.joplin.check.fail'))
    } finally {
      setCheckLoading(false)
    }
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t('settings.joplin.title')} onBackPress={handleBackPress} />
      <SettingContainer>
        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.joplin.url')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.joplin.url_placeholder')}
            value={''}
            onChangeText={text => handleProviderConfigChange('apiHost', text)}
          />
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} justifyContent="space-between" alignItems="center">
            <SettingGroupTitle>{t('settings.joplin.token')}</SettingGroupTitle>
            <Button
              size={16}
              icon={<ShieldCheck size={16} />}
              backgroundColor="$colorTransparent"
              circular
              onPress={handleOpenBottomSheet}
            />
          </XStack>

          <XStack paddingVertical={8} gap={8} position="relative">
            <Input
              flex={1}
              placeholder={t('settings.joplin.token_placeholder')}
              secureTextEntry={!showApiKey}
              paddingRight={48}
              value={''}
              onChangeText={text => handleProviderConfigChange('apiKey', text)}
            />
            <Stack
              position="absolute"
              right={10}
              top="50%"
              height={16}
              width={16}
              alignItems="center"
              justifyContent="center"
              zIndex={1}
              onPress={toggleApiKeyVisibility}
              cursor="pointer">
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </Stack>
          </XStack>

          <XStack justifyContent="space-between">
            <ExternalLink href="https://joplinapp.org/help/apps/clipper" size={12}>
              {t('settings.joplin.help')}
            </ExternalLink>
          </XStack>
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} justifyContent="space-between">
            <SettingGroupTitle>{t('settings.notion.export_reasoning.title')}</SettingGroupTitle>
            <CustomSwitch />
          </XStack>
          <Text fontSize="$3" color="$gray11" paddingHorizontal={10}>
            {t('settings.notion.export_reasoning.help')}
          </Text>
        </YStack>
      </SettingContainer>
      <ApiCheckSheet
        bottomSheetRef={bottomSheetRef}
        isOpen={isBottomSheetOpen}
        onClose={handleBottomSheetClose}
        apiKey={''}
        onStartModelCheck={checkConnection}
        loading={checkLoading}
      />
    </SafeAreaContainer>
  )
}
