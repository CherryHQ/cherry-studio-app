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

export type ProviderField = {
  type: 'input' | 'password' | 'switch'
  key: string
  titleKey: string
  placeholderKey?: string
  helpUrl?: string
  helpTextKey?: string
  descriptionKey?: string
}

export type ProviderConfig = {
  providerType: string
  titleKey: string
  fields: ProviderField[]
  checkConnectionFn: () => Promise<void>
}

export default function ProviderSettingsScreen({ config }: { config: ProviderConfig }) {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation()

  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [checkLoading, setCheckLoading] = useState(false)
  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)
  const { provider, isLoading, updateProvider } = useDataBackupProvider(config.providerType)

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

  const toggleApiKeyVisibility = (key: string) => {
    setShowApiKey(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleProviderConfigChange = async (key: string, value: any) => {
    try {
      if (!provider) return

      const updatedProvider = {
        ...provider,
        [key]: value
      }

      await updateProvider(updatedProvider)
      console.log('Provider config updated:', key, value)
    } catch (error) {
      console.error('Error updating provider config:', error)
      Alert.alert(t(`settings.${config.providerType}.update.fail`))
    }
  }

  async function checkConnection() {
    setCheckLoading(true)

    try {
      await config.checkConnectionFn()
    } catch (error) {
      throw error
    } finally {
      setCheckLoading(false)
    }
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar title={t(config.titleKey)} onBackPress={handleBackPress} />
      <SettingContainer>
        {config.fields.map((field, index) => (
          <YStack key={index} gap={8}>
            {field.type === 'input' && (
              <>
                <XStack paddingHorizontal={10} height={20} alignItems="center">
                  <SettingGroupTitle>{t(field.titleKey)}</SettingGroupTitle>
                </XStack>
                <Input
                  placeholder={field.placeholderKey ? t(field.placeholderKey) : ''}
                  value={provider[field.key] || ''}
                  onChangeText={text => handleProviderConfigChange(field.key, text)}
                />
                {field.helpUrl && field.helpTextKey && (
                  <XStack justifyContent="space-between">
                    <ExternalLink href={field.helpUrl} size={12}>
                      {t(field.helpTextKey)}
                    </ExternalLink>
                  </XStack>
                )}
              </>
            )}

            {field.type === 'password' && (
              <>
                <XStack paddingHorizontal={10} height={20} justifyContent="space-between" alignItems="center">
                  <SettingGroupTitle>{t(field.titleKey)}</SettingGroupTitle>
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
                    placeholder={field.placeholderKey ? t(field.placeholderKey) : ''}
                    secureTextEntry={!showApiKey[field.key]}
                    paddingRight={48}
                    value={provider[field.key] || ''}
                    onChangeText={text => handleProviderConfigChange(field.key, text)}
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
                    onPress={() => toggleApiKeyVisibility(field.key)}
                    cursor="pointer">
                    {showApiKey[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Stack>
                </XStack>

                {field.helpUrl && field.helpTextKey && (
                  <XStack justifyContent="space-between">
                    <ExternalLink href={field.helpUrl} size={12}>
                      {t(field.helpTextKey)}
                    </ExternalLink>
                  </XStack>
                )}
              </>
            )}

            {field.type === 'switch' && (
              <>
                <XStack paddingHorizontal={10} height={20} justifyContent="space-between">
                  <SettingGroupTitle>{t(field.titleKey)}</SettingGroupTitle>
                  <CustomSwitch
                    checked={provider[field.key] || false}
                    onCheckedChange={value => handleProviderConfigChange(field.key, value)}
                  />
                </XStack>
                {field.descriptionKey && (
                  <Text fontSize="$3" color="$gray11" paddingHorizontal={10}>
                    {t(field.descriptionKey)}
                  </Text>
                )}
              </>
            )}
          </YStack>
        ))}
      </SettingContainer>
      <ApiCheckSheet
        bottomSheetRef={bottomSheetRef}
        isOpen={isBottomSheetOpen}
        apiKey={provider[config.fields.find(f => f.type === 'password')?.key || ''] || ''}
        onClose={handleBottomSheetClose}
        onStartModelCheck={checkConnection}
        loading={checkLoading}
      />
    </SafeAreaContainer>
  )
}
