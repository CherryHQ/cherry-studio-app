import BottomSheet from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { Eye, EyeOff, ShieldCheck } from '@tamagui/lucide-icons'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'
import { Button, Input, Stack, useTheme, XStack, YStack } from 'tamagui'

import ExternalLink from '@/components/ExternalLink'
import { SettingContainer, SettingGroupTitle } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { ApiCheckSheet } from '@/components/settings/websearch/ApiCheckSheet'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'

export default function SiyuanSettingsScreen() {
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
      console.log('Checking Siyuan connection...')
      Alert.alert(t('settings.siyuan.check.success'))
    } catch (error) {
      Alert.alert(t('settings.siyuan.check.fail'))
    } finally {
      setCheckLoading(false)
    }
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t('settings.siyuan.title')} onBackPress={handleBackPress} />
      <SettingContainer>
        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.siyuan.api_url')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.siyuan.api_url_placeholder')}
            value={''}
            onChangeText={text => handleProviderConfigChange('apiHost', text)}
          />
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} justifyContent="space-between" alignItems="center">
            <SettingGroupTitle>{t('settings.siyuan.token')}</SettingGroupTitle>
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
              placeholder={t('settings.siyuan.token_placeholder')}
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
            <ExternalLink href="https://docs.cherry-ai.com/advanced-basic/siyuan" size={12}>
              {t('settings.siyuan.token.help')}
            </ExternalLink>
          </XStack>
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.siyuan.box_id')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.siyuan.box_id_placeholder')}
            value={''}
            onChangeText={text => handleProviderConfigChange('apiHost', text)}
          />
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.siyuan.root_path')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.siyuan.root_path_placeholder')}
            value={''}
            onChangeText={text => handleProviderConfigChange('apiHost', text)}
          />
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
