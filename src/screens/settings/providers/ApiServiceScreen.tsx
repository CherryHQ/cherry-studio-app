import type { RouteProp } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { Button, Spinner } from 'heroui-native'
import React, { useEffect, useState } from 'react'
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
import { presentProviderCheckSheet } from '@/componentsV2/features/Sheet/ProviderCheckSheet'
import { Eye, EyeOff, ShieldCheck, XCircle } from '@/componentsV2/icons/LucideIcon'
import { PROVIDER_URLS } from '@/config/providers'
import { useProvider } from '@/hooks/useProviders'
import type { ProvidersStackParamList } from '@/navigators/settings/ProvidersStackNavigator'
import type { ApiStatus } from '@/types/assistant'

type ProviderSettingsRouteProp = RouteProp<ProvidersStackParamList, 'ApiServiceScreen'>

export default function ApiServiceScreen() {
  const { t } = useTranslation()
  const route = useRoute<ProviderSettingsRouteProp>()

  const { providerId } = route.params
  const { provider, isLoading, updateProvider } = useProvider(providerId)

  const [showApiKey, setShowApiKey] = useState(false)
  const [checkApiStatus, setCheckApiStatus] = useState<ApiStatus>('idle')
  const [apiKey, setApiKey] = useState(provider?.apiKey || '')
  const [apiHost, setApiHost] = useState(provider?.apiHost || '')

  // 当 provider 改变时更新本地状态
  useEffect(() => {
    if (provider) {
      setApiKey(provider.apiKey || '')
      setApiHost(provider.apiHost || '')
    }
  }, [provider])

  const webSearchProviderConfig = provider?.id ? PROVIDER_URLS[provider.id] : undefined
  const apiKeyWebsite = webSearchProviderConfig?.websites?.apiKey

  if (isLoading) {
    return (
      <SafeAreaContainer className="items-center justify-center">
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

  const handleProviderCheck = () => {
    presentProviderCheckSheet(provider, setCheckApiStatus)
  }

  const toggleApiKeyVisibility = () => {
    setShowApiKey(prevShowApiKey => !prevShowApiKey)
  }

  const handleProviderConfigChange = async (key: 'apiKey' | 'apiHost', value: string) => {
    if (key === 'apiKey') {
      setApiKey(value)
    } else if (key === 'apiHost') {
      setApiHost(value)
    }

    const updatedProvider = { ...provider, [key]: value }
    await updateProvider(updatedProvider)
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t('settings.provider.api_service')} />
      <Container>
        {/* API Key 配置 */}
        <YStack className="gap-2">
          <XStack className="items-center justify-between">
            <GroupTitle>{t('settings.provider.api_key.label')}</GroupTitle>
            <Button
              pressableFeedbackVariant="ripple"
              size="sm"
              isIconOnly
              variant="ghost"
              onPress={handleProviderCheck}>
              <Button.Label>
                {checkApiStatus === 'idle' && <ShieldCheck size={16} />}
                {checkApiStatus === 'error' && <XCircle size={16} />}
                {checkApiStatus === 'processing' && <Spinner size="sm" />}
                {checkApiStatus === 'success' && <ShieldCheck size={16} className="primary-text" />}
              </Button.Label>
            </Button>
          </XStack>

          <XStack className="relative gap-2">
            <TextField className="flex-1">
              <TextField.Input
                className="h-12 pr-0"
                value={apiKey}
                secureTextEntry={!showApiKey}
                placeholder={t('settings.provider.api_key.placeholder')}
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
            <ExternalLink href={apiKeyWebsite} content={t('settings.provider.api_key.get')} />
          </XStack>
        </YStack>

        {/* API Host 配置 */}
        <YStack className="gap-2">
          <XStack className="items-center justify-between pr-3">
            <GroupTitle>{t('settings.provider.api_host.label')}</GroupTitle>
          </XStack>
          <TextField>
            <TextField.Input
              className="h-12"
              placeholder={t('settings.provider.api_host.placeholder')}
              value={apiHost}
              onChangeText={text => handleProviderConfigChange('apiHost', text)}
            />
          </TextField>
        </YStack>
      </Container>
    </SafeAreaContainer>
  )
}
