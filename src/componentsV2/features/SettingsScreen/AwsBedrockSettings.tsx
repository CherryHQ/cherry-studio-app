import { Button } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ExternalLink, GroupTitle, Text, TextField, XStack, YStack } from '@/componentsV2'
import { Eye, EyeOff } from '@/componentsV2/icons/LucideIcon'
import { PROVIDER_URLS } from '@/config/providers'
import { useDialog } from '@/hooks/useDialog'
import AwsBedrockService from '@/services/AwsBedrockService'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('AwsBedrockSettings')

interface AwsBedrockSettingsProps {
  providerId: string
}

export const AwsBedrockSettings: React.FC<AwsBedrockSettingsProps> = ({ providerId }) => {
  const { t } = useTranslation()
  const dialog = useDialog()

  const [region, setRegion] = useState('us-east-1')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [showSecretKey, setShowSecretKey] = useState(false)

  const providerConfig = PROVIDER_URLS['aws-bedrock']
  const apiKeyWebsite = providerConfig?.websites?.apiKey

  // Load credentials on mount
  useEffect(() => {
    AwsBedrockService.getAwsBedrockCredentials(providerId).then(creds => {
      if (creds) {
        setRegion(creds.region)
        setAccessKeyId(creds.accessKeyId)
        setSecretAccessKey(creds.secretAccessKey)
      }
    })
  }, [providerId])

  const handleSave = async () => {
    if (!region || !accessKeyId || !secretAccessKey) {
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('common.all_fields_required', { defaultValue: 'All fields are required' })
      })
      return
    }

    try {
      await AwsBedrockService.saveAwsBedrockCredentials(providerId, {
        region,
        accessKeyId,
        secretAccessKey
      })

      dialog.open({
        type: 'success',
        title: t('settings.provider.success'),
        content: t('common.save_success', { defaultValue: 'Successfully saved' })
      })
    } catch (error) {
      logger.error('Failed to save AWS Bedrock credentials:', error)
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('common.save_failed', { defaultValue: 'Failed to save' })
      })
    }
  }

  return (
    <YStack className="gap-4">
      <YStack className="gap-2">
        <Text className="rounded-lg bg-blue-10 p-3 text-sm dark:bg-blue-dark-10">
          {t('settings.provider.aws-bedrock.description')}
        </Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.aws-bedrock.region')}</GroupTitle>
        <TextField>
          <TextField.Input
            className="h-12"
            placeholder="us-east-1"
            value={region}
            onChangeText={setRegion}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TextField>
        <Text className="px-3 text-xs opacity-40">{t('settings.provider.aws-bedrock.region_help')}</Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.aws-bedrock.access_key_id')}</GroupTitle>
        <TextField>
          <TextField.Input
            className="h-12"
            placeholder="AKIAIOSFODNN7EXAMPLE"
            value={accessKeyId}
            onChangeText={setAccessKeyId}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TextField>
        <Text className="px-3 text-xs opacity-40">{t('settings.provider.aws-bedrock.access_key_id_help')}</Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.aws-bedrock.secret_access_key')}</GroupTitle>
        <TextField>
          <TextField.Input
            className="h-12"
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            value={secretAccessKey}
            onChangeText={setSecretAccessKey}
            secureTextEntry={!showSecretKey}
            autoCapitalize="none"
            autoCorrect={false}>
            <TextField.InputEndContent>
              <Button size="sm" variant="ghost" isIconOnly onPress={() => setShowSecretKey(!showSecretKey)}>
                <Button.Label>
                  {showSecretKey ? <EyeOff className="text-white" size={16} /> : <Eye size={16} />}
                </Button.Label>
              </Button>
            </TextField.InputEndContent>
          </TextField.Input>
        </TextField>
        <XStack className="justify-between px-3">
          <Text className="text-xs opacity-40">{t('settings.provider.aws-bedrock.secret_access_key_help')}</Text>
          {apiKeyWebsite && <ExternalLink href={apiKeyWebsite} content={t('settings.provider.api_key.get')} />}
        </XStack>
      </YStack>

      <Button onPress={handleSave}>
        <Button.Label>{t('common.save')}</Button.Label>
      </Button>
    </YStack>
  )
}
