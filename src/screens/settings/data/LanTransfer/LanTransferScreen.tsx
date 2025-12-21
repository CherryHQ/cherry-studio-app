import type { NavigationProp, ParamListBase } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Device from 'expo-device'
import { Spinner } from 'heroui-native'
import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import Zeroconf from 'react-native-zeroconf'

import {
  Container,
  HeaderBar,
  presentDialog,
  RestoreProgressModal,
  SafeAreaContainer,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { ReceiveProgressModal } from '@/componentsV2/features/SettingsScreen/ReceiveProgressModal'
import { TriangleAlert } from '@/componentsV2/icons'
import { LAN_TRANSFER_DOMAIN, LAN_TRANSFER_PROTOCOL_VERSION, LAN_TRANSFER_SERVICE_TYPE } from '@/constants/lanTransfer'
import { useAppState } from '@/hooks/useAppState'
import { useLanTransfer } from '@/hooks/useLanTransfer'
import { LAN_RESTORE_STEPS_WITH_CLEAR, useRestore } from '@/hooks/useRestore'
import { useCurrentTopic } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import { FileTransferStatus, LanTransferServerStatus } from '@/types/lanTransfer'
import type { LanTransferRouteProp } from '@/types/naviagate'
import { getLanTransferServiceName } from '@/utils'

const logger = loggerService.withContext('LanTransferScreen')

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
    port: serverPort,
    connectedClient,
    lastError: serverError,
    fileTransfer,
    completedFilePath,
    clearCompletedFile
  } = useLanTransfer()
  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal } = useRestore({
    clearBeforeRestore: true,
    stepConfigs: LAN_RESTORE_STEPS_WITH_CLEAR
  })
  const { t } = useTranslation()

  const modelName = useMemo(() => Device.modelName || `Cherry-${Platform.OS}`, [])
  const serviceName = useMemo(() => getLanTransferServiceName(modelName, serverPort), [modelName, serverPort])

  const isReceiving = fileTransfer?.status === FileTransferStatus.RECEIVING

  // Effect 1: 初始化 Zeroconf 和启动 TCP server
  useEffect(() => {
    const service = serviceRef.current
    service.zeroconf = new Zeroconf()
    service.zeroconf.on('error', error => {
      logger.error('Zeroconf error', error)
      presentDialog('error', {
        title: t('settings.data.lan_transfer.zeroconf_error'),
        content: `${error}`
      })
    })

    startServer()

    return () => {
      const cleanupStart = Date.now()
      logger.info('[CLEANUP] Starting cleanup')

      // 异步清理，不阻塞 UI（让返回按钮立即响应）
      setImmediate(() => {
        // 清理 mDNS
        if (service.zeroconf && service.publishedName) {
          const unpublishStart = Date.now()
          try {
            service.zeroconf.unpublishService(service.publishedName)
          } catch (error) {
            logger.error('[CLEANUP] unpublishService error', error)
          }
          logger.info('[CLEANUP] unpublishService took', { elapsed: Date.now() - unpublishStart })
          service.publishedName = null
        }

        const stopServerStart = Date.now()
        stopServer()
        logger.info('[CLEANUP] stopServer took', { elapsed: Date.now() - stopServerStart })
        service.started = false

        // 清理 Zeroconf
        const zeroconfStopStart = Date.now()
        try {
          service.zeroconf?.stop()
          service.zeroconf?.removeDeviceListeners()
        } catch (err) {
          logger.warn('[CLEANUP] Zeroconf cleanup error', err as Error)
        }
        logger.info('[CLEANUP] zeroconf.stop took', { elapsed: Date.now() - zeroconfStopStart })

        logger.info('[CLEANUP] Total cleanup took', { elapsed: Date.now() - cleanupStart })
      })
    }
  }, [startServer, stopServer, t])

  // Effect 2: 当端口可用时发布 mDNS
  useEffect(() => {
    const service = serviceRef.current
    if (!serverPort || !service.zeroconf || service.publishedName) return

    // 先尝试注销可能残留的旧服务（防止名称冲突 -72001）
    try {
      service.zeroconf.unpublishService(serviceName)
    } catch {
      // 忽略注销错误 - 可能本来就不存在
    }

    // 延迟一小段时间确保旧服务完全注销
    const publishTimeout = setTimeout(() => {
      try {
        service.zeroconf?.publishService(
          LAN_TRANSFER_SERVICE_TYPE,
          'tcp',
          LAN_TRANSFER_DOMAIN,
          serviceName,
          serverPort,
          {
            version: LAN_TRANSFER_PROTOCOL_VERSION,
            modelName: Device.modelName || `Cherry-${Platform.OS}`,
            platform: Platform.OS,
            appVersion: Device.osVersion || 'unknown'
          }
        )
        service.publishedName = serviceName
        service.started = true
        logger.info(`Publishing service: ${serviceName} on port ${serverPort}`)
      } catch (error) {
        logger.error('Failed to publish Zeroconf service', error)
        presentDialog('error', {
          title: t('settings.data.lan_transfer.zeroconf_error'),
          content: `${error}`
        })
      }
    }, 100)

    return () => {
      clearTimeout(publishTimeout)
    }
  }, [serverPort, serviceName, t])

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
      content: `${t('settings.data.lan_transfer.backup_detected_body')}\n${t('settings.data.restore.confirm_warning')}`,
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
              {t('settings.data.lan_transfer.port')}: {serverPort || '...'}
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
        </YStack>
      </Container>

      {(serverStatus === LanTransferServerStatus.STARTING || serverStatus === LanTransferServerStatus.HANDSHAKING) && (
        <YStack className="absolute inset-0 z-10 items-center justify-center bg-black/60">
          <Spinner />
          <Text className="mt-4 text-lg text-white">{t('settings.data.lan_transfer.preparing')}</Text>
        </YStack>
      )}

      <ReceiveProgressModal isOpen={isReceiving} fileTransfer={fileTransfer ?? null} />

      <RestoreProgressModal
        isOpen={isModalOpen}
        steps={restoreSteps}
        overallStatus={overallStatus}
        onClose={handleModalClose}
      />
    </SafeAreaContainer>
  )
}
