import type { NavigationProp, ParamListBase } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Device from 'expo-device'
import { Spinner } from 'heroui-native'
import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import Zeroconf from 'react-native-zeroconf'

import { Container, HeaderBar, presentDialog, SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { RestoreProgressModal } from '@/componentsV2/features/SettingsScreen/RestoreProgressModal'
import { TriangleAlert } from '@/componentsV2/icons'
import {
  LAN_TRANSFER_DOMAIN,
  LAN_TRANSFER_PROTOCOL_VERSION,
  LAN_TRANSFER_SERVICE_TYPE,
  LAN_TRANSFER_TCP_PORT
} from '@/constants/lanTransfer'
import { useAppState } from '@/hooks/useAppState'
import { useLanTransfer } from '@/hooks/useLanTransfer'
import { useRestore } from '@/hooks/useRestore'
import { useCurrentTopic } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import { LanTransferServerStatus } from '@/types/lanTransfer'
import type { LanTransferRouteProp } from '@/types/naviagate'

const logger = loggerService.withContext('LanTransferScreen')

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export default function LanTransferScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>()
  const route = useRoute<LanTransferRouteProp>()
  const { setWelcomeShown } = useAppState()
  const { switchTopic } = useCurrentTopic()

  const serviceRef = useRef<{
    zeroconf: Zeroconf | null
    publishedName: string | null
    started: boolean
  }>({ zeroconf: null, publishedName: null, started: false })

  const {
    startServer,
    stopServer,
    status: serverStatus,
    connectedClient,
    lastError: serverError,
    fileTransfer,
    completedFilePath,
    clearCompletedFile,
    transferCancelled,
    clearTransferCancelled
  } = useLanTransfer()
  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal } = useRestore({
    clearBeforeRestore: true
  })
  const { t } = useTranslation()

  const serviceName = useMemo(() => {
    const modelName = Device.modelName || `Cherry-${Platform.OS}`
    return `Cherry Studio (${modelName})`
  }, [])

  // 合并的服务生命周期 effect：初始化 Zeroconf、启动/停止服务
  useEffect(() => {
    const service = serviceRef.current
    service.zeroconf = new Zeroconf()

    const zc = service.zeroconf
    zc.on('error', error => {
      logger.error('Zeroconf error', error)
    })

    // 启动服务
    const doStartService = () => {
      if (!service.zeroconf || service.started) return

      try {
        service.zeroconf.publishService(
          LAN_TRANSFER_SERVICE_TYPE,
          'tcp',
          LAN_TRANSFER_DOMAIN,
          serviceName,
          LAN_TRANSFER_TCP_PORT,
          {
            version: LAN_TRANSFER_PROTOCOL_VERSION,
            modelName: Device.modelName || `Cherry-${Platform.OS}`,
            platform: Platform.OS,
            appVersion: Device.osVersion || 'unknown'
          }
        )
        service.publishedName = serviceName
        logger.info(`Publishing service: ${serviceName}`)
      } catch (error) {
        logger.error('Failed to publish Zeroconf service', error)
        presentDialog('error', {
          title: t('settings.data.lan_transfer.zeroconf_error'),
          content: `${error}`
        })
        return
      }

      startServer()
      service.started = true
    }

    doStartService()

    return () => {
      // 停止服务
      if (service.zeroconf && service.publishedName) {
        try {
          service.zeroconf.unpublishService(service.publishedName)
        } catch (error) {
          logger.error('Failed to unpublish Zeroconf service', error)
        }
        service.publishedName = null
      }
      stopServer()
      service.started = false

      // 清理 Zeroconf
      try {
        zc.stop()
        zc.removeDeviceListeners()
      } catch (err) {
        logger.warn('Failed to cleanup Zeroconf', err as Error)
      }
    }
  }, [serviceName, startServer, stopServer, t])

  useEffect(() => {
    if (serverStatus === LanTransferServerStatus.ERROR && serverError) {
      presentDialog('error', {
        title: t('settings.data.lan_transfer.transfer_error'),
        content: serverError,
        onConfirm: () => {
          navigation.goBack()
        }
      })
    }
  }, [serverStatus, serverError, navigation, t])

  useEffect(() => {
    if (transferCancelled) {
      presentDialog('info', {
        title: t('settings.data.lan_transfer.transfer_cancelled_title'),
        content: t('settings.data.lan_transfer.transfer_cancelled_body')
      })
      clearTransferCancelled()
    }
  }, [transferCancelled, clearTransferCancelled, t])

  useEffect(() => {
    if (!completedFilePath) return

    // 内联停止服务逻辑，避免不稳定的函数依赖
    const service = serviceRef.current
    if (service.zeroconf && service.publishedName) {
      try {
        service.zeroconf.unpublishService(service.publishedName)
      } catch (error) {
        logger.error('Failed to unpublish Zeroconf service', error)
      }
      service.publishedName = null
    }
    stopServer()
    service.started = false

    presentDialog('info', {
      title: t('settings.data.lan_transfer.backup_detected_title'),
      content: t('settings.data.lan_transfer.backup_detected_body'),
      confirmText: t('settings.data.lan_transfer.restore_confirm'),
      cancelText: t('settings.data.lan_transfer.restore_later'),
      showCancel: true,
      onConfirm: () => {
        if (!completedFilePath) return

        const fileName = completedFilePath.split('/').pop() || `cherry-studio-${Date.now()}.zip`

        startRestore({
          name: fileName,
          uri: completedFilePath,
          size: 0,
          mimeType: 'application/zip'
        })

        clearCompletedFile()
      },
      onCancel: () => {
        clearCompletedFile()
        navigation.goBack()
      }
    })
  }, [clearCompletedFile, completedFilePath, navigation, startRestore, stopServer, t])

  const handleModalClose = async () => {
    closeModal()

    const shouldRedirectToHome = route.params?.redirectToHome && overallStatus === 'success'

    if (shouldRedirectToHome) {
      try {
        const defaultAssistant = await getDefaultAssistant()
        const newTopic = await topicService.createTopic(defaultAssistant)
        navigation.navigate('HomeScreen', {
          screen: 'Home',
          params: {
            screen: 'ChatScreen',
            params: { topicId: newTopic.id }
          }
        })
        await switchTopic(newTopic.id)
        await setWelcomeShown(true)
        return
      } catch (error) {
        logger.error('Failed to redirect after LAN restore:', error)
      }
    }

    navigation.goBack()
  }

  return (
    <SafeAreaContainer>
      <HeaderBar title={t('settings.data.lan_transfer.title')} />

      <Container className="flex-1">
        <YStack className="flex-1 gap-3">
          {!connectedClient && (
            <XStack className="w-full items-center gap-2.5 rounded-lg bg-orange-400/10 px-3.5 py-3">
              <TriangleAlert size={20} className="text-orange-400" />
              <Text className="flex-1 text-sm text-orange-400">
                {t('settings.data.lan_transfer.no_connection_warning')}
              </Text>
            </XStack>
          )}

          <XStack className="gap-3">
            <Text>{t('settings.data.lan_transfer.info')}</Text>
          </XStack>

          <YStack className="bg-secondary gap-1 rounded-xl p-3">
            <Text>
              {t('settings.data.lan_transfer.status')}: {serverStatus}
            </Text>
            <Text>
              {t('settings.data.lan_transfer.service')}: {serviceName}
            </Text>
            <Text>
              {t('settings.data.lan_transfer.port')}: {LAN_TRANSFER_TCP_PORT}
            </Text>
            <Text>
              {t('settings.data.lan_transfer.device')}: {Device.modelName || t('settings.data.lan_transfer.unknown')} (
              {Device.osName} {Device.osVersion})
            </Text>
            {connectedClient && (
              <>
                <Text className="text-md">
                  {t('settings.data.lan_transfer.device')}: {connectedClient.deviceName}
                  {connectedClient.platform ? ` (${connectedClient.platform})` : ''}
                </Text>
                {connectedClient.appVersion && (
                  <Text>
                    {t('settings.data.lan_transfer.app_version')}: {connectedClient.appVersion}
                  </Text>
                )}
              </>
            )}
            {serverError && (
              <Text className="text-error-base text-md">
                {t('settings.data.lan_transfer.error')}: {serverError}
              </Text>
            )}
          </YStack>

          {fileTransfer && (
            <YStack className="bg-secondary gap-2 rounded-xl p-3">
              <Text className="text-sm font-semibold">{t('settings.data.lan_transfer.file_transfer')}</Text>
              <Text className="text-md">{fileTransfer.fileName}</Text>
              <Text>
                {formatBytes(fileTransfer.bytesReceived)} / {formatBytes(fileTransfer.fileSize)}
              </Text>

              <YStack className="bg-background h-2 overflow-hidden rounded-full">
                <YStack className="bg-primary h-full rounded-full" style={{ width: `${fileTransfer.percentage}%` }} />
              </YStack>

              <XStack className="justify-between">
                <Text>{fileTransfer.percentage}%</Text>
                <Text>
                  {fileTransfer.chunksReceived}/{fileTransfer.totalChunks} {t('settings.data.lan_transfer.chunks')}
                </Text>
              </XStack>

              {fileTransfer.estimatedRemainingMs != null && fileTransfer.estimatedRemainingMs > 0 && (
                <Text>
                  {t('settings.data.lan_transfer.eta')}: {formatDuration(fileTransfer.estimatedRemainingMs)}
                </Text>
              )}

              <Text>
                {t('settings.data.lan_transfer.status')}: {fileTransfer.status}
              </Text>

              {fileTransfer.error && <Text className="text-error-base text-md">{fileTransfer.error}</Text>}
            </YStack>
          )}
        </YStack>
      </Container>

      {(serverStatus === LanTransferServerStatus.STARTING || serverStatus === LanTransferServerStatus.HANDSHAKING) && (
        <YStack className="absolute inset-0 z-10 items-center justify-center bg-black/60">
          <Spinner />
          <Text className="mt-4 text-lg text-white">{t('settings.data.lan_transfer.preparing')}</Text>
        </YStack>
      )}

      <RestoreProgressModal
        isOpen={isModalOpen}
        steps={restoreSteps}
        overallStatus={overallStatus}
        onClose={handleModalClose}
      />
    </SafeAreaContainer>
  )
}
