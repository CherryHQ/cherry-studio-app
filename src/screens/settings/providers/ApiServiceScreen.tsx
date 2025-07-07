import BottomSheet from '@gorhom/bottom-sheet'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Eye, EyeOff, ShieldCheck } from '@tamagui/lucide-icons'
import { sortBy } from 'lodash'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { Button, Input, Stack, Text, useTheme, XStack, YStack } from 'tamagui'

import ExternalLink from '@/components/ExternalLink'
import { SettingContainer, SettingGroupTitle, SettingHelpText } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { ApiCheckSheet } from '@/components/settings/providers/ApiCheckSheet'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { isEmbeddingModel } from '@/config/models/embedding'
import { PROVIDER_CONFIG } from '@/config/providers'
import { useProvider } from '@/hooks/useProviders'
import { checkApi } from '@/services/ApiService'
import { Model } from '@/types/assistant'
import { NavigationProps, RootStackParamList } from '@/types/naviagate'
import { getModelUniqId } from '@/utils/model'

type ProviderSettingsRouteProp = RouteProp<RootStackParamList, 'ApiServiceScreen'>

export default function ApiServiceScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation<NavigationProps>()
  const route = useRoute<ProviderSettingsRouteProp>()

  const { providerId } = route.params
  const { provider, isLoading, updateProvider } = useProvider(providerId)

  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState<Model | undefined>()
  const [isCheckingApi, setIsCheckingApi] = useState(false)

  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)

  const webSearchProviderConfig = provider?.id ? PROVIDER_CONFIG[provider.id] : undefined
  const apiKeyWebsite = webSearchProviderConfig?.websites?.apiKey

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

  const selectOptions = !provider.models?.length
    ? []
    : [
        {
          label: provider.isSystem ? t(`provider.${provider.id}`) : provider.name,
          title: provider.name,
          options: sortBy(provider.models, 'name')
            .filter(model => !isEmbeddingModel(model))
            .map(model => ({
              label: model.name,
              value: getModelUniqId(model),
              model
            }))
        }
      ]

  const handleOpenBottomSheet = () => {
    bottomSheetRef.current?.expand()
    setIsBottomSheetOpen(true)
  }

  const handleBottomSheetClose = () => {
    setIsBottomSheetOpen(false)
  }

  const handleModelChange = (value: string) => {
    if (!value) {
      setSelectedModel(undefined)
      return
    }

    const allOptions = selectOptions.flatMap(group => group.options)
    const foundOption = allOptions.find(opt => opt.value === value)
    setSelectedModel(foundOption?.model)
  }

  const toggleApiKeyVisibility = () => {
    setShowApiKey(prevShowApiKey => !prevShowApiKey)
  }

  const handleProviderConfigChange = async (key: 'apiKey' | 'apiHost', value: string) => {
    const updatedProvider = { ...provider, [key]: value }
    await updateProvider(updatedProvider)
  }

  const handleBackPress = () => {
    navigation.goBack()
  }

  // 模型检测处理
  const handleStartModelCheck = async () => {
    if (!selectedModel) return

    try {
      setIsCheckingApi(true)
      await checkApi(provider, selectedModel)
      await updateProvider({ ...provider, checked: true })
    } catch (error) {
      console.error('Model check failed:', error)
      await updateProvider({ ...provider, checked: false })
    } finally {
      setIsCheckingApi(false)
    }
  }

  return (
    <SafeAreaContainer
      style={{
        flex: 1,
        backgroundColor: theme.background.val
      }}>
      <HeaderBar title={t('settings.provider.api_service')} onBackPress={handleBackPress} />

      <SettingContainer>
        {/* API Key 配置 */}
        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} justifyContent="space-between" alignItems="center">
            <SettingGroupTitle>{t('settings.provider.api_key')}</SettingGroupTitle>
            <Button
              size={16}
              icon={<ShieldCheck size={16} color={provider.checked ? 'green' : 'white'} />}
              backgroundColor="$colorTransparent"
              circular
              onPress={handleOpenBottomSheet}
            />
          </XStack>

          <XStack paddingVertical={8} gap={8} position="relative">
            <Input
              flex={1}
              placeholder={t('settings.provider.api_key.placeholder')}
              secureTextEntry={!showApiKey}
              paddingRight={48}
              value={provider?.apiKey || ''}
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
            <SettingHelpText>{t('settings.provider.api_key.tip')}</SettingHelpText>
            <ExternalLink href={apiKeyWebsite} size={12}>
              {t('settings.provider.api_key.get')}
            </ExternalLink>
          </XStack>
        </YStack>

        {/* API Host 配置 */}
        <YStack gap={8}>
          <XStack paddingHorizontal={10} height={20} alignItems="center">
            <SettingGroupTitle>{t('settings.provider.api_host')}</SettingGroupTitle>
          </XStack>
          <Input
            placeholder={t('settings.provider.api_host.placeholder')}
            value={provider?.apiHost || ''}
            onChangeText={text => handleProviderConfigChange('apiHost', text)}
          />
        </YStack>
      </SettingContainer>

      <ApiCheckSheet
        bottomSheetRef={bottomSheetRef}
        isOpen={isBottomSheetOpen}
        onClose={handleBottomSheetClose}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        selectOptions={selectOptions}
        apiKey={provider?.apiKey || ''}
        onStartModelCheck={handleStartModelCheck}
        isCheckingApi={isCheckingApi}
      />
    </SafeAreaContainer>
  )
}
