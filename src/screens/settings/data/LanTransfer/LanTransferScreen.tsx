import * as Device from 'expo-device'
import { Spinner } from 'heroui-native'
import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, ScrollView } from 'react-native'
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
import { TriangleAlert } from '@/componentsV2/icons'
import {
  LAN_TRANSFER_DOMAIN,
  LAN_TRANSFER_PROTOCOL_VERSION,
  LAN_TRANSFER_SERVICE_TYPE,
  LAN_TRANSFER_TCP_PORT
} from '@/constants/lanTransfer'
import { useAppState } from '@/hooks/useAppState'
import { useLanTransfer } from '@/hooks/useLanTransfer'
import { LAN_RESTORE_STEPS, RESTORE_STEP_CONFIGS, useRestore } from '@/hooks/useRestore'
import { useCurrentTopic } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import { LanTransferServerStatus } from '@/types/lanTransfer'

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
  const zeroconfRef = useRef<Zeroconf | null>(null)
  const publishedServiceNameRef = useRef<string | null>(null)
  const startedRef = useRef(false)

  const {
    startServer,
    stopServer,
    clearLogs: clearServerLogs,
    status: serverStatus,
    connectedClient,
    lastError: serverError,
    fileTransfer,
    completedFilePath,
    clearCompletedFile
  } = useLanTransfer()

  const { setWelcomeShown } = useAppState()
  const { switchTopic } = useCurrentTopic()
  const { t } = useTranslation()

  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal, updateStepStatus, openModal } =
    useRestore({
      stepConfigs: LAN_RESTORE_STEPS,
      clearBeforeRestore: true
    })

  useEffect(() => {
    zeroconfRef.current = new Zeroconf()

    const zc = zeroconfRef.current
    zc.on('error', error => {
      logger.error('Zeroconf error', error)
    })

    return () => {
      try {
        zc.stop()
        if (publishedServiceNameRef.current) {
          zc.unpublishService(publishedServiceNameRef.current)
        }
        zc.removeDeviceListeners()
      } catch (err) {
        logger.warn('Failed to cleanup Zeroconf', err as Error)
      }
      stopServer()
      clearServerLogs()
    }
  }, [clearServerLogs, stopServer])

  const serviceName = useMemo(() => {
    const modelName = Device.modelName || `Cherry-${Platform.OS}`
    return `Cherry Studio (${modelName})`
  }, [])

  const handleStartService = () => {
    if (!zeroconfRef.current || startedRef.current) return

    try {
      zeroconfRef.current.publishService(
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
      publishedServiceNameRef.current = serviceName
      logger.info(`Publishing service: ${serviceName}`)
    } catch (error) {
      logger.error('Failed to publish Zeroconf service', error)
      presentDialog('error', {
        title: 'Zeroconf Error',
        content: `${error}`
      })
      return
    }

    startServer()
    startedRef.current = true
  }

  const handleStopService = () => {
    if (zeroconfRef.current && publishedServiceNameRef.current) {
      try {
        zeroconfRef.current.unpublishService(publishedServiceNameRef.current)
      } catch (error) {
        logger.error('Failed to unpublish Zeroconf service', error)
      }
      publishedServiceNameRef.current = null
    }

    stopServer()
    startedRef.current = false
  }

  useEffect(() => {
    handleStartService()

    return () => {
      handleStopService()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (serverStatus === LanTransferServerStatus.RECEIVING_FILE && !isModalOpen) {
      openModal()
      updateStepStatus(RESTORE_STEP_CONFIGS.RECEIVE_FILE.id, 'in_progress')
    }
  }, [serverStatus, isModalOpen, openModal, updateStepStatus])

  useEffect(() => {
    if (serverStatus === LanTransferServerStatus.ERROR && serverError) {
      presentDialog('error', {
        title: 'LAN Transfer Error',
        content: serverError
      })
    }
  }, [serverStatus, serverError])

  useEffect(() => {
    const handleRestore = async () => {
      if (!completedFilePath) return

      handleStopService()
      updateStepStatus(RESTORE_STEP_CONFIGS.RECEIVE_FILE.id, 'completed')

      const fileName = completedFilePath.split('/').pop() || 'backup.zip'
      try {
        await startRestore(
          {
            name: fileName,
            uri: completedFilePath
          },
          true
        )
      } finally {
        clearCompletedFile()
      }
    }

    handleRestore()
  }, [clearCompletedFile, completedFilePath, startRestore, updateStepStatus])

  const isStarting = serverStatus === LanTransferServerStatus.STARTING

  const handleModalClose = async () => {
    closeModal()

    const shouldRedirectToHome = overallStatus === 'success'

    if (shouldRedirectToHome) {
      try {
        const defaultAssistant = await getDefaultAssistant()
        const newTopic = await topicService.createTopic(defaultAssistant)
        await switchTopic(newTopic.id)
        await setWelcomeShown(true)
      } catch (error) {
        logger.error('Failed to redirect after restore', error)
      }
    }
  }

  return (
    <SafeAreaContainer>
      <HeaderBar title="LAN Transfer" />

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
          <Text className="text-sm font-semibold opacity-60">LAN Transfer Service</Text>
          <XStack className="gap-3">
            <Text className="text-xs opacity-60">
              {isStarting
                ? 'Starting...'
                : serverStatus === LanTransferServerStatus.LISTENING
                  ? 'Listening'
                  : serverStatus}
            </Text>
          </XStack>

          <YStack className="bg-secondary gap-1 rounded-xl p-3">
            <Text className="text-xs opacity-60">Status: {serverStatus}</Text>
            <Text className="text-xs opacity-60">Service: {serviceName}</Text>
            <Text className="text-xs opacity-60">Port: {LAN_TRANSFER_TCP_PORT}</Text>
            <Text className="text-xs opacity-60">
              Device: {Device.modelName || 'Unknown'} ({Device.osName} {Device.osVersion})
            </Text>
            {connectedClient && (
              <>
                <Text className="text-xs">
                  Device: {connectedClient.deviceName}
                  {connectedClient.platform ? ` (${connectedClient.platform})` : ''}
                </Text>
                {connectedClient.appVersion && (
                  <Text className="text-xs opacity-60">App Version: {connectedClient.appVersion}</Text>
                )}
              </>
            )}
            {serverError && <Text className="text-error-base text-xs">Error: {serverError}</Text>}
          </YStack>

          {fileTransfer && (
            <YStack className="bg-secondary gap-2 rounded-xl p-3">
              <Text className="text-sm font-semibold">File Transfer</Text>
              <Text className="text-xs">{fileTransfer.fileName}</Text>
              <Text className="text-xs opacity-60">
                {formatBytes(fileTransfer.bytesReceived)} / {formatBytes(fileTransfer.fileSize)}
              </Text>

              <YStack className="bg-background h-2 overflow-hidden rounded-full">
                <YStack className="bg-primary h-full rounded-full" style={{ width: `${fileTransfer.percentage}%` }} />
              </YStack>

              <XStack className="justify-between">
                <Text className="text-xs opacity-60">{fileTransfer.percentage}%</Text>
                <Text className="text-xs opacity-60">
                  {fileTransfer.chunksReceived}/{fileTransfer.totalChunks} chunks
                </Text>
              </XStack>

              {fileTransfer.estimatedRemainingMs && fileTransfer.estimatedRemainingMs > 0 && (
                <Text className="text-xs opacity-60">ETA: {formatDuration(fileTransfer.estimatedRemainingMs)}</Text>
              )}

              <Text className="text-xs opacity-60">Status: {fileTransfer.status}</Text>

              {fileTransfer.error && <Text className="text-error-base text-xs">{fileTransfer.error}</Text>}
            </YStack>
          )}

          <YStack className="flex-1 gap-2">
            <Text className="text-sm font-semibold opacity-60">Logs</Text>
            <ScrollView className="bg-secondary flex-1 rounded-xl p-3">
              <YStack className="gap-1">
                <Text className="text-xs opacity-40">Use Zeroconf to discover this device from desktop.</Text>
              </YStack>
            </ScrollView>
          </YStack>
        </YStack>
      </Container>

      {(serverStatus === LanTransferServerStatus.STARTING || serverStatus === LanTransferServerStatus.HANDSHAKING) && (
        <YStack
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10
          }}>
          <Spinner />
          <Text className="mt-4 text-lg text-white">Preparing...</Text>
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
