import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { Button } from 'heroui-native'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import {
  Container,
  ExternalLink,
  GroupTitle,
  HeaderBar,
  presentDialog,
  SafeAreaContainer,
  Text,
  TextField,
  XStack,
  YStack
} from '@/componentsV2'
import { Eye, EyeOff, ShieldCheck } from '@/componentsV2/icons/LucideIcon'
import { WEB_SEARCH_PROVIDER_CONFIG } from '@/config/websearchProviders'
import { useWebSearchProvider } from '@/hooks/useWebsearchProviders'
import type { WebSearchStackParamList } from '@/navigators/settings/WebSearchStackNavigator'
import WebSearchService from '@/services/WebSearchService'

type WebsearchProviderSettingsRouteProp = RouteProp<WebSearchStackParamList, 'WebSearchProviderSettingsScreen'>

const waitForDialogSpinner = () => new Promise(resolve => setTimeout(resolve, 50))

export default function WebSearchProviderSettingsScreen() {
  const { t } = useTranslation()
  const route = useRoute<WebsearchProviderSettingsRouteProp>()

  const [showApiKey, setShowApiKey] = useState(false)

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
          <Text className="text-zinc-400/400 py-6 text-center">{t('settings.provider.not_found_message')}</Text>
        </Container>
      </SafeAreaContainer>
    )
  }

  const toggleApiKeyVisibility = () => {
    setShowApiKey(prevShowApiKey => !prevShowApiKey)
  }

  const handleProviderConfigChange = async (key: 'apiKey' | 'apiHost', value: string) => {
    const updatedProvider = { ...provider, [key]: value }
    await updateProvider(updatedProvider)
  }

  const handleApiCheck = () => {
    presentDialog('info', {
      title: t('settings.provider.api_check.title'),
      content: t('settings.provider.api_check.confirm_message'),
      showCancel: true,
      onConfirm: async () => {
        if (!provider) return
        await waitForDialogSpinner()

        try {
          const { valid, error } = await WebSearchService.checkSearch(provider)
          const errorMessage =
            error && error?.message
              ? ' ' + (error.message.length > 100 ? error.message.substring(0, 100) + '...' : error.message)
              : ''

          if (valid) {
            presentDialog('success', {
              title: t('settings.websearch.check_success'),
              content: t('settings.websearch.check_success_message')
            })
          } else {
            presentDialog('error', {
              title: t('settings.websearch.check_fail'),
              content: errorMessage
            })
          }
        } catch {
          presentDialog('error', {
            title: t('settings.websearch.check_error'),
            content: t('common.error_occurred')
          })
        }
      }
    })
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
              <Button pressableFeedbackVariant="ripple" size="sm" isIconOnly variant="ghost" onPress={handleApiCheck}>
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
                    <Button
                      pressableFeedbackVariant="ripple"
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      onPress={toggleApiKeyVisibility}>
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
    </SafeAreaContainer>
  )
}
