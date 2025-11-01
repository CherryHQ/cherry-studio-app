import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { Button } from 'heroui-native'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import {
  Container,
  ExternalLink,
  GroupTitle,
  HeaderBar,
  SafeAreaContainer,
  Text,
  TextField,
  XStack,
  YStack
} from '@/componentsV2'
import { WebSearchApiCheckSheet } from '@/componentsV2/features/SettingsScreen/WebSearchApiCheckSheet'
import { Eye, EyeOff, ShieldCheck } from '@/componentsV2/icons/LucideIcon'
import { WEB_SEARCH_PROVIDER_CONFIG } from '@/config/websearchProviders'
import { useDialog } from '@/hooks/useDialog'
import { useWebSearchProvider } from '@/hooks/useWebsearchProviders'
import type { WebSearchStackParamList } from '@/navigators/settings/WebSearchStackNavigator'
import WebSearchService from '@/services/WebSearchService'
import type { ApiStatus } from '@/types/assistant'

type WebsearchProviderSettingsRouteProp = RouteProp<WebSearchStackParamList, 'WebSearchProviderSettingsScreen'>

export default function WebSearchProviderSettingsScreen() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const route = useRoute<WebsearchProviderSettingsRouteProp>()

  const [showApiKey, setShowApiKey] = useState(false)
  const [checkApiStatus, setCheckApiStatus] = useState<ApiStatus>('idle')

  const bottomSheetRef = useRef<BottomSheetModal>(null)

  const { providerId } = route.params
  const { provider, isLoading, updateProvider } = useWebSearchProvider(providerId)
  const webSearchProviderConfig = provider?.id ? WEB_SEARCH_PROVIDER_CONFIG[provider.id] : undefined
  const apiKeyWebsite = webSearchProviderConfig?.websites?.apiKey

  if (isLoading) {
    return (
      <SafeAreaContainer className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  if (!provider) {
    return (
      <SafeAreaContainer>
        <HeaderBar title={t('settings.provider.not_found')} />
        <Container>
          <Text className="py-6 text-center text-gray-400">{t('settings.provider.not_found_message')}</Text>
        </Container>
      </SafeAreaContainer>
    )
  }

  const handleOpenBottomSheet = () => {
    bottomSheetRef.current?.present()
  }

  const handleBottomSheetClose = () => {
    bottomSheetRef.current?.dismiss()
  }

  const toggleApiKeyVisibility = () => {
    setShowApiKey(prevShowApiKey => !prevShowApiKey)
  }

  const handleProviderConfigChange = async (key: 'apiKey' | 'apiHost', value: string) => {
    const updatedProvider = { ...provider, [key]: value }
    await updateProvider(updatedProvider)
  }

  async function checkSearch() {
    // TODO : 支持多个 API Key 检测
    if (!provider) return
    setCheckApiStatus('processing')

    try {
      const { valid, error } = await WebSearchService.checkSearch(provider)
      const errorMessage =
        error && error?.message
          ? ' ' + (error.message.length > 100 ? error.message.substring(0, 100) + '...' : error.message)
          : ''

      if (valid) {
        setCheckApiStatus('success')
      } else {
        dialog.open({
          type: 'error',
          title: t('settings.websearch.check_fail'),
          content: errorMessage,
          onConFirm: () => handleBottomSheetClose()
        })
      }
    } catch (error) {
      dialog.open({
        type: 'error',
        title: t('settings.websearch.check_error'),
        content: t('common.error_occurred'),
        onConFirm: () => handleBottomSheetClose()
      })
      throw error
    } finally {
      setTimeout(() => {
        setCheckApiStatus('idle')
        handleBottomSheetClose()
      }, 500)
    }
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={provider.name} />
      <Container>
        {/* API Key 配置 */}
        {provider.type === 'api' && (
          <YStack className="gap-2">
            <XStack className="items-center justify-between">
              <GroupTitle>{t('settings.websearch.api_key.label')}</GroupTitle>
              <Button size="sm" isIconOnly variant="ghost" onPress={handleOpenBottomSheet}>
                <Button.Label>
                  <ShieldCheck size={16} className="text-blue-500" />
                </Button.Label>
              </Button>
            </XStack>

            <XStack className="relative gap-2">
              <TextField className="flex-1">
                <TextField.Input
                  className="h-12 pr-0"
                  value={provider?.apiKey || ''}
                  secureTextEntry={!showApiKey}
                  placeholder={t('settings.websearch.api_key.placeholder')}
                  onChangeText={text => handleProviderConfigChange('apiKey', text)}>
                  <TextField.InputEndContent>
                    <Button size="sm" variant="ghost" isIconOnly onPress={toggleApiKeyVisibility}>
                      <Button.Label>
                        {showApiKey ? <EyeOff className="text-white" size={16} /> : <Eye size={16} />}
                      </Button.Label>
                    </Button>
                  </TextField.InputEndContent>
                </TextField.Input>
              </TextField>
            </XStack>

            <XStack className="justify-between px-3">
              <Text className="text-xs opacity-40">{t('settings.provider.api_key.tip')}</Text>
              <ExternalLink href={apiKeyWebsite} content={t('settings.websearch.api_key.get')} />
            </XStack>
          </YStack>
        )}

        {/* API Host 配置 */}
        <YStack className="gap-2">
          <XStack className="items-center justify-between pr-3">
            <GroupTitle>{t('settings.websearch.api_host.label')}</GroupTitle>
          </XStack>
          <TextField>
            <TextField.Input
              className="h-12"
              placeholder={t('settings.websearch.api_host.placeholder')}
              value={provider?.apiHost || ''}
              onChangeText={text => handleProviderConfigChange('apiHost', text)}
            />
          </TextField>
        </YStack>
      </Container>
      <WebSearchApiCheckSheet ref={bottomSheetRef} onStartModelCheck={checkSearch} checkApiStatus={checkApiStatus} />
    </SafeAreaContainer>
  )
}
