import { useNavigation } from '@react-navigation/native'
import { File } from 'expo-file-system'
import { Spinner } from 'heroui-native'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HeaderBar, RestoreProgressModal, SafeAreaContainer, Text, YStack } from '@/componentsV2'
import { DEFAULT_BACKUP_STORAGE } from '@/constants/storage'
import { LANDROP_RESTORE_STEPS, RESTORE_STEP_CONFIGS, useRestore } from '@/hooks/useRestore'
import { useWebSocket, WebSocketStatus } from '@/hooks/useWebSocket'
import { loggerService } from '@/services/LoggerService'
import type { DataSourcesNavigationProps } from '@/types/naviagate'
import type { ConnectionInfo } from '@/types/network'

import { QRCodeScanner } from './QRCodeScanner'

const logger = loggerService.withContext('landropSettingsScreen')

export default function LandropSettingsScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<DataSourcesNavigationProps>()
  const { status, filename, connect, disconnect } = useWebSocket()
  const [scannedIP, setScannedIP] = useState<string | null>(null)
  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal, updateStepStatus, openModal } =
    useRestore({
      stepConfigs: LANDROP_RESTORE_STEPS
    })

  const hasScannedRef = useRef(false)
  const disconnectRef = useRef(disconnect)

  useEffect(() => {
    disconnectRef.current = disconnect
  }, [disconnect])

  useEffect(() => {
    return () => {
      logger.debug('Component unmounting, disconnecting WebSocket')
      disconnectRef.current()
    }
  }, [])

  useEffect(() => {
    if (status === WebSocketStatus.DISCONNECTED) {
      setScannedIP(null)

      hasScannedRef.current = false
    }
  }, [status])

  // 监听 WebSocket 状态，更新文件接收步骤
  useEffect(() => {
    if (status === WebSocketStatus.ZIP_FILE_START) {
      // 文件开始接收时，打开模态框并设置接收文件步骤为进行中
      openModal()
      updateStepStatus(RESTORE_STEP_CONFIGS.RECEIVE_FILE.id, 'in_progress')
    } else if (status === WebSocketStatus.ZIP_FILE_END) {
      // 文件接收完成，更新步骤状态为完成
      updateStepStatus(RESTORE_STEP_CONFIGS.RECEIVE_FILE.id, 'completed')
    } else if (status === WebSocketStatus.ERROR) {
      // 接收文件时出错
      updateStepStatus(RESTORE_STEP_CONFIGS.RECEIVE_FILE.id, 'error')
    }
  }, [status, openModal, updateStepStatus])

  // 文件发送完毕后开始恢复
  useEffect(() => {
    const handleRestore = async () => {
      if (status === WebSocketStatus.ZIP_FILE_END) {
        const zip = new File(DEFAULT_BACKUP_STORAGE, filename)
        logger.debug('zip', zip)
        await startRestore(
          {
            name: zip.name,
            uri: zip.uri,
            size: zip.size || 0,
            mimeType: zip.type || ''
          },
          true // skipModalSetup - 不重置步骤，因为 RECEIVE_FILE 已经完成
        )
      }
    }

    handleRestore()
  }, [filename, startRestore, status])

  const handleQRCodeScanned = async (connectionInfo: ConnectionInfo) => {
    if (hasScannedRef.current) {
      return
    }

    hasScannedRef.current = true

    setScannedIP(`Connection attempt: ${connectionInfo.candidates.length} candidates`)
    await connect(connectionInfo)

    // Log connection attempt details
    if (typeof connectionInfo === 'string') {
      logger.info(`Connecting to Landrop sender at ${connectionInfo} (legacy format)`)
    } else {
      logger.info(
        `Connecting to Landrop sender with ${connectionInfo.candidates.length} IP candidates, selected: ${connectionInfo.selectedHost}`
      )
    }
  }

  const handleModalClose = () => {
    closeModal()
    navigation.goBack()
  }

  const showLoading = status === WebSocketStatus.CONNECTING || status === WebSocketStatus.CONNECTED

  return (
    <SafeAreaContainer style={{ flex: 1 }}>
      <HeaderBar title={t('settings.data.landrop.scan_qr_code.title')} />

      {!isModalOpen && !scannedIP && <QRCodeScanner onQRCodeScanned={handleQRCodeScanned} />}

      {showLoading && (
        <YStack
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10
          }}>
          <Spinner />
          <Text className="mt-4 text-lg text-white">
            {status === WebSocketStatus.CONNECTING
              ? t('settings.data.landrop.scan_qr_code.connecting')
              : t('settings.data.landrop.scan_qr_code.waiting_for_file')}
          </Text>
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
