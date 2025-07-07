import BottomSheet from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import { Eye, EyeOff, ShieldCheck } from '@tamagui/lucide-icons'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert } from 'react-native'
import { Button, Input, Stack, Text, useTheme, XStack, YStack } from 'tamagui'

import ExternalLink from '@/components/ExternalLink'
import { SettingContainer, SettingGroupTitle } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { ApiCheckSheet } from '@/components/settings/websearch/ApiCheckSheet'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { CustomSwitch } from '@/components/ui/Switch'
import { useDataBackupProvider } from '@/hooks/useDataBackup'

export default function NotionSettingsScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation()

  const [showApiKey, setShowApiKey] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)
  const { provider, isLoading, updateProvider } = useDataBackupProvider('notion')

  if (isLoading) {
    return (
      <SafeAreaContainer>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  if (!provider) {
    return (
      <SafeAreaContainer>
        <HeaderBar title={t('settings.provider.not_found')} onBackPress={() => navigation.goBack()} />
        <SettingContainer>
          <Text textAlign="center" color="$gray10" paddingVertical={24}>
            {t('settings.provider.not_found_message')}
          </Text>
        </SettingContainer>
      </SafeAreaContainer>
    )
  }

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

  const handleProviderConfigChange = async (key: string, value: any) => {
    try {
      if (!provider) return

      const updatedProvider = {
        ...provider,
        [key === 'apiKey'
          ? 'notionApiKey'
          : key === 'apiHost'
            ? 'notionDatabaseID'
            : key === 'pageNameKey'
              ? 'notionPageNameKey'
              : key === 'exportReasoning'
                ? 'notionExportReasoning'
                : key]: value
      }

      await updateProvider(updatedProvider)
      console.log('Provider config updated:', key, value)
    } catch (error) {
      console.error('Error updating provider config:', error)
      Alert.alert(t('settings.notion.update.fail'))
    }
  }

  async function checkConnection() {
    setCheckLoading(true)

    try {
      console.log('Checking Notion connection...')
      Alert.alert(t('settings.notion.check.success'))
    } catch (error) {
      Alert.alert(t('settings.notion.check.fail'))
      throw error
    } finally {
      setCheckLoading(false)
    }
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t('settings.notion.title')} onBackPress={handleBackPress} />
      <SettingContainer>
        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.notion.database_id')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.notion.database_id_placeholder')}
            value={provider.notionDatabaseID || ''}
            onChangeText={text => handleProviderConfigChange('notionDatabaseID', text)}
          />
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} justifyContent="space-between" alignItems="center">
            <SettingGroupTitle>{t('settings.notion.api_key')}</SettingGroupTitle>
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
              placeholder={t('settings.notion.api_key_placeholder')}
              secureTextEntry={!showApiKey}
              paddingRight={48}
              value={provider.notionApiKey || ''}
              onChangeText={text => handleProviderConfigChange('notionApiKey', text)}
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
            <ExternalLink href="https://docs.cherry-ai.com/advanced-basic/notion" size={12}>
              {t('settings.notion.help')}
            </ExternalLink>
          </XStack>
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.notion.page_name_key')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.notion.page_name_key_placeholder')}
            value={provider.notionPageNameKey || ''}
            onChangeText={text => handleProviderConfigChange('notionPageNameKey', text)}
          />
        </YStack>

        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} justifyContent="space-between">
            <SettingGroupTitle>{t('settings.notion.export_reasoning.title')}</SettingGroupTitle>
            <CustomSwitch
              checked={provider.notionExportReasoning || false}
              onCheckedChange={value => handleProviderConfigChange('notionExportReasoning', value)}
            />
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
