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
import { DashScopeSpeechService } from '@/services/DashScopeSpeechService'
import { getSpeechToTextProviders } from '@/config/speechToTextProviders'
import { SPEECH_TO_TEXT_PROVIDER_CONFIG } from '@/config/speechToTextProviders'
import { usePreference } from '@/hooks/usePreference'
import type { SpeechToTextSettingsStackParamList } from '@/navigators/settings/SpeechToTextSettingsStackNavigator'

type SpeechToTextProviderSettingsRouteProp = RouteProp<SpeechToTextSettingsStackParamList, 'SpeechToTextProviderSettingsScreen'>

const waitForDialogSpinner = () => new Promise(resolve => setTimeout(resolve, 50))

export default function SpeechToTextProviderSettingsScreen() {
  const { t } = useTranslation()
  const route = useRoute<SpeechToTextProviderSettingsRouteProp>()

  const [showApiKey, setShowApiKey] = useState(false)

  const { providerId } = route.params
  const [providersConfig, setProvidersConfig] = usePreference('speechToTextProviders' as any)

  const apiKey = providersConfig?.[providerId]?.apiKey || ''

  const providerConfig = providerId ? SPEECH_TO_TEXT_PROVIDER_CONFIG[providerId as keyof typeof SPEECH_TO_TEXT_PROVIDER_CONFIG] : undefined
  const apiKeyWebsite = providerConfig?.websites?.apiKey

  const toggleApiKeyVisibility = () => {
    setShowApiKey(prevShowApiKey => !prevShowApiKey)
  }

  const handleApiKeyChange = (value: string) => {
    const updatedConfig: Record<string, { apiKey: string }> = {
      ...(providersConfig || {}),
      [providerId]: { apiKey: value }
    }
    setProvidersConfig(updatedConfig)
  }

  const handleApiCheck = () => {
    if (!apiKey) {
      presentDialog('error', {
        title: t('settings.provider.api_check.error_title'),
        content: t('settings.provider.api_check.empty_api_key')
      })
      return
    }

    presentDialog('info', {
      title: t('settings.provider.api_check.title'),
      content: t('settings.provider.api_check.confirm_message'),
      showCancel: true,
      onConfirm: async () => {
        await waitForDialogSpinner()

        try {
          const providers = getSpeechToTextProviders()
          const provider = providers.find(p => p.id === providerId)

          if (!provider) {
            presentDialog('error', {
              title: t('settings.provider.api_check.error_title'),
              content: t('settings.provider.not_found_message')
            })
            return
          }

          const providerWithKey = { ...provider, apiKey }
          let result

          if (providerId === 'bailian') {
            const service = new DashScopeSpeechService(providerWithKey)
            result = await service.checkConnection()
          } else {
            // 对于其他provider，暂时认为有效（后续可以扩展）
            result = { valid: true, error: undefined }
          }

          const errorMessage =
            result?.error && result.error?.message
              ? ' ' + (result.error.message.length > 100 ? result.error.message.substring(0, 100) + '...' : result.error.message)
              : ''

          if (result.valid) {
            presentDialog('success', {
              title: t('settings.speechToText.check_success'),
              content: t('settings.speechToText.check_success_message')
            })
          } else {
            presentDialog('error', {
              title: t('settings.speechToText.check_fail'),
              content: errorMessage || t('common.error_occurred')
            })
          }
        } catch (error) {
          presentDialog('error', {
            title: t('settings.speechToText.check_error'),
            content: t('common.error_occurred')
          })
        }
      }
    })
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title={t(`settings.speechToText.provider.${providerId}`)} />
      <Container>
        {/* API Key 配置 */}
        <YStack className="gap-2">
          <XStack className="items-center justify-between">
            <GroupTitle>{t('settings.speechToText.api_key.label')}</GroupTitle>
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
                value={apiKey}
                secureTextEntry={!showApiKey}
                placeholder={t('settings.speechToText.api_key.placeholder')}
                onChangeText={handleApiKeyChange}>
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
            {apiKeyWebsite && <ExternalLink href={apiKeyWebsite} content={t('settings.speechToText.api_key.get')} />}
          </XStack>
        </YStack>
      </Container>
    </SafeAreaContainer>
  )
}
