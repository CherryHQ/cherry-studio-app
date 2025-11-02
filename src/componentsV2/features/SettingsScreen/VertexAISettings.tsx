import { Button } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ExternalLink, GroupTitle, Text, TextField, XStack, YStack } from '@/componentsV2'
import { PROVIDER_URLS } from '@/config/providers'
import { getVertexCredentials, saveVertexCredentials } from '@/hooks/useVertexAI'
import { useDialog } from '@/hooks/useDialog'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('VertexAISettings')

interface VertexAISettingsProps {
  providerId: string
}

export const VertexAISettings: React.FC<VertexAISettingsProps> = ({ providerId }) => {
  const { t } = useTranslation()
  const dialog = useDialog()

  const [projectId, setProjectId] = useState('')
  const [location, setLocation] = useState('us-central1')
  const [clientEmail, setClientEmail] = useState('')
  const [privateKey, setPrivateKey] = useState('')

  const providerConfig = PROVIDER_URLS.vertexai
  const apiKeyWebsite = providerConfig?.websites?.apiKey

  // Load credentials on mount
  useEffect(() => {
    getVertexCredentials(providerId).then(creds => {
      if (creds) {
        setProjectId(creds.project)
        setLocation(creds.location)
        setClientEmail(creds.clientEmail)
        setPrivateKey(creds.privateKey)
      }
    })
  }, [providerId])

  const handleSave = async () => {
    if (!projectId || !location || !clientEmail || !privateKey) {
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('common.all_fields_required', { defaultValue: 'All fields are required' })
      })
      return
    }

    try {
      await saveVertexCredentials(providerId, {
        project: projectId,
        location,
        clientEmail,
        privateKey
      })

      dialog.open({
        type: 'success',
        title: t('settings.provider.success'),
        content: t('common.save_success', { defaultValue: 'Successfully saved' })
      })
    } catch (error) {
      logger.error('Failed to save VertexAI credentials:', error)
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
          {t('settings.provider.vertex_ai.service_account.description')}
        </Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.vertex_ai.project_id')}</GroupTitle>
        <TextField>
          <TextField.Input
            className="h-12"
            placeholder={t('settings.provider.vertex_ai.project_id_placeholder')}
            value={projectId}
            onChangeText={setProjectId}
          />
        </TextField>
        <Text className="px-3 text-xs opacity-40">{t('settings.provider.vertex_ai.project_id_help')}</Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.vertex_ai.location')}</GroupTitle>
        <TextField>
          <TextField.Input className="h-12" placeholder="us-central1" value={location} onChangeText={setLocation} />
        </TextField>
        <Text className="px-3 text-xs opacity-40">{t('settings.provider.vertex_ai.location_help')}</Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.vertex_ai.service_account.client_email')}</GroupTitle>
        <TextField>
          <TextField.Input
            className="h-12"
            placeholder={t('settings.provider.vertex_ai.service_account.client_email_placeholder')}
            value={clientEmail}
            onChangeText={setClientEmail}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TextField>
        <Text className="px-3 text-xs opacity-40">{t('settings.provider.vertex_ai.service_account.client_email_help')}</Text>
      </YStack>

      <YStack className="gap-2">
        <GroupTitle>{t('settings.provider.vertex_ai.service_account.private_key')}</GroupTitle>
        <TextField>
          <TextField.Input
            className="h-24"
            placeholder={t('settings.provider.vertex_ai.service_account.private_key_placeholder')}
            value={privateKey}
            onChangeText={setPrivateKey}
            multiline
            numberOfLines={4}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TextField>
        <XStack className="justify-between px-3">
          <Text className="text-xs opacity-40">{t('settings.provider.vertex_ai.service_account.private_key_help')}</Text>
          {apiKeyWebsite && <ExternalLink href={apiKeyWebsite} content={t('settings.provider.api_key.get')} />}
        </XStack>
      </YStack>

      <Button onPress={handleSave}>
        <Button.Label>{t('common.save')}</Button.Label>
      </Button>
    </YStack>
  )
}
