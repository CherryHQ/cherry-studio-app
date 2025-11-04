import { Button } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'

import { Group, GroupTitle, PressableRow, Row, Text, XStack, YStack } from '@/componentsV2'
import { Copy, ExternalLink as ExternalLinkIcon, } from '@/componentsV2/icons/LucideIcon'
import { useCopilotToken } from '@/hooks/useCopilotToken'
import { useDialog } from '@/hooks/useDialog'
import CopilotService from '@/services/CopilotService'
import { loggerService } from '@/services/LoggerService'
import type { Provider } from '@/types/assistant'

const logger = loggerService.withContext('CopilotSettings')

interface CopilotSettingsProps {
  provider: Provider
  updateProvider: (provider: Provider) => Promise<void>
}

enum AuthStep {
  NOT_STARTED,
  CODE_GENERATED,
  WAITING_FOR_AUTH,
  AUTHENTICATED
}

export const CopilotSettings: React.FC<CopilotSettingsProps> = ({ provider, updateProvider }) => {
  const { t } = useTranslation()
  const dialog = useDialog()
  const { token, saveToken, deleteToken } = useCopilotToken(false) // Don't auto-load

  const [currentStep, setCurrentStep] = useState<AuthStep>(AuthStep.NOT_STARTED)
  const [userCode, setUserCode] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [deviceCode, setDeviceCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copilotUser, setCopilotUser] = useState<{ login: string; avatar: string } | null>(null)

  // Check authentication status on mount
  useEffect(() => {
    if (provider.isAuthed && token) {
      setCurrentStep(AuthStep.AUTHENTICATED)
      // Try to get user info
      CopilotService.getToken(token)
        .then(async tokenResponse => {
          const user = await CopilotService.getUser(tokenResponse.token)
          setCopilotUser(user)
        })
        .catch(error => {
          logger.error('Failed to get Copilot user info:', error)
        })
    }
  }, [provider.isAuthed, token])

  const handleStartAuth = async () => {
    setIsLoading(true)
    try {
      const authResponse = await CopilotService.getAuthMessage()
      setDeviceCode(authResponse.device_code)
      setUserCode(authResponse.user_code)
      setVerificationUri(authResponse.verification_uri)
      setCurrentStep(AuthStep.CODE_GENERATED)
    } catch (error) {
      logger.error('Failed to start authentication:', error)
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('settings.provider.copilot.code_failed')
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyCode = async () => {
    dialog.open({
      type: 'info',
      title: t('settings.provider.copilot.step_copy_code'),
      content: userCode
    })
  }

  const handleOpenBrowser = async () => {
    try {
      await Linking.openURL(verificationUri)
      setCurrentStep(AuthStep.WAITING_FOR_AUTH)
    } catch (error) {
      logger.error('Failed to open browser:', error)
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('common.open_link_failed', { defaultValue: 'Failed to open browser' })
      })
    }
  }

  const handleCompleteAuth = async () => {
    if (!deviceCode) return

    setIsLoading(true)
    try {
      const tokenResponse = await CopilotService.getCopilotToken(deviceCode)
      await saveToken(tokenResponse.access_token)

      const user = await CopilotService.getUser(tokenResponse.access_token)
      setCopilotUser(user)

      const updatedProvider = { ...provider, isAuthed: true }
      await updateProvider(updatedProvider)

      setCurrentStep(AuthStep.AUTHENTICATED)

      dialog.open({
        type: 'success',
        title: t('settings.provider.success'),
        content: t('settings.provider.copilot.auth_success')
      })
    } catch (error) {
      logger.error('Failed to complete authentication:', error)
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('settings.provider.copilot.auth_failed')
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    setIsLoading(true)
    try {
      await deleteToken()
      setCopilotUser(null)

      const updatedProvider = { ...provider, isAuthed: false }
      await updateProvider(updatedProvider)

      setCurrentStep(AuthStep.NOT_STARTED)
      setDeviceCode('')
      setUserCode('')
      setVerificationUri('')

      dialog.open({
        type: 'success',
        title: t('settings.provider.success'),
        content: t('settings.provider.copilot.logout_success')
      })
    } catch (error) {
      logger.error('Failed to logout:', error)
      dialog.open({
        type: 'error',
        title: t('settings.provider.error'),
        content: t('settings.provider.copilot.logout_failed')
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Render authenticated state
  if (currentStep === AuthStep.AUTHENTICATED && copilotUser) {
    return (
      <YStack className="gap-4">
        <Text className="rounded-lg bg-green-10 p-3 text-sm dark:bg-green-dark-10">
          ✓ {t('settings.provider.copilot.auth_success_title')}
        </Text>

        <Group>
          <Row>
            <Text className="font-semibold">{t('common.logged_in_as', { defaultValue: 'Logged in as' })}:</Text>
            <Text>{copilotUser.login}</Text>
          </Row>
          <PressableRow onPress={handleLogout}>
            <Text className="text-red-100 dark:text-red-dark-100">{t('settings.provider.copilot.logout')}</Text>
          </PressableRow>
        </Group>
      </YStack>
    )
  }

  // Render authentication flow
  return (
    <YStack className="gap-4">
      <Text className="rounded-lg bg-blue-10 p-3 text-sm dark:bg-blue-dark-10">
        {t('settings.provider.copilot.description')}
      </Text>

      {currentStep === AuthStep.NOT_STARTED && (
        <Button onPress={handleStartAuth} isDisabled={isLoading}>
          <Button.Label>
            {isLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('settings.provider.copilot.start_auth')}
          </Button.Label>
        </Button>
      )}

      {currentStep >= AuthStep.CODE_GENERATED && (
        <YStack className="gap-4">
          {/* Step 1: Copy verification code */}
          <YStack className="gap-2 rounded-lg border border-border p-4">
            <XStack className="items-center gap-2">
              <Text className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                1
              </Text>
              <GroupTitle className="m-0">{t('settings.provider.copilot.step_copy_code')}</GroupTitle>
            </XStack>
            <Text className="font-mono text-lg font-bold">{userCode}</Text>
            <Button size="sm" onPress={handleCopyCode}>
              <Button.Label>
                <XStack className="items-center gap-2">
                  <Copy size={16} />
                  <Text>{t('common.copy')}</Text>
                </XStack>
              </Button.Label>
            </Button>
          </YStack>

          {/* Step 2: Open GitHub authorization page */}
          <YStack className="gap-2 rounded-lg border border-border p-4">
            <XStack className="items-center gap-2">
              <Text
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                  currentStep >= AuthStep.WAITING_FOR_AUTH ? 'bg-green-100 dark:bg-green-dark-100' : 'bg-primary'
                }`}>
                2
              </Text>
              <GroupTitle className="m-0">{t('settings.provider.copilot.step_authorize')}</GroupTitle>
            </XStack>
            <Text className="text-sm">{t('settings.provider.copilot.step_authorize_detail')}</Text>
            <Button size="sm" onPress={handleOpenBrowser}>
              <Button.Label>
                <XStack className="items-center gap-2">
                  <ExternalLinkIcon size={16} />
                  <Text>{t('settings.provider.copilot.open_verification_page')}</Text>
                </XStack>
              </Button.Label>
            </Button>
          </YStack>

          {/* Step 3: Complete authentication */}
          {currentStep >= AuthStep.WAITING_FOR_AUTH && (
            <YStack className="gap-2 rounded-lg border border-border p-4">
              <XStack className="items-center gap-2">
                <Text className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  3
                </Text>
                <GroupTitle className="m-0">{t('settings.provider.copilot.step_connect')}</GroupTitle>
              </XStack>
              <Text className="text-sm">{t('settings.provider.copilot.step_connect_detail')}</Text>
              <Button onPress={handleCompleteAuth} isDisabled={isLoading}>
                <Button.Label>
                  {isLoading
                    ? t('common.connecting', { defaultValue: 'Connecting...' })
                    : t('settings.provider.copilot.connect')}
                </Button.Label>
              </Button>
            </YStack>
          )}
        </YStack>
      )}
    </YStack>
  )
}
