import { useNavigation } from '@react-navigation/native'
import { CameraView, PermissionStatus, useCameraPermissions } from 'expo-camera'
import { Spinner } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { Container, Text, XStack, YStack } from '@/componentsV2'
import { ScanQrCode } from '@/componentsV2/icons/LucideIcon'
import { useDialog } from '@/hooks/useDialog'
import { loggerService } from '@/services/LoggerService'
import type { CompressedConnectionInfo, ConnectionInfo } from '@/types/network'

import { Overlay } from './Overlay'
const logger = loggerService.withContext('QRCodeScanner')

// Helper function to convert number back to IP address
const numberToIp = (num: number): string => {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.')
}

// Function to decompress connection info from QR code
const decompressConnectionInfo = (compressedData: CompressedConnectionInfo): Omit<ConnectionInfo, 'type'> => {
  const [, selectedIpNum, candidateIpNums, port, timestamp] = compressedData

  return {
    selectedHost: numberToIp(selectedIpNum),
    candidates: candidateIpNums.map(host => ({
      host: numberToIp(host),
      interface: 'unknown',
      priority: 1
    })),
    port,
    timestamp
  }
}

interface QRCodeScannerProps {
  onQRCodeScanned: (connectionInfo: ConnectionInfo) => void
}

export function QRCodeScanner({ onQRCodeScanned }: QRCodeScannerProps) {
  const { t } = useTranslation()
  const navigation = useNavigation()
  const dialog = useDialog()
  const [permission, requestPermission] = useCameraPermissions()
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (permission?.status === PermissionStatus.DENIED) {
      dialog.open({
        type: 'error',
        title: t('common.error_occurred'),
        content: t('settings.data.landrop.scan_qr_code.permission_denied'),
        showCancel: false,
        onConFirm: () => navigation.goBack()
      })
      return
    }

    const getPermission = async () => {
      if (!permission?.granted && !isRequestingPermission) {
        setIsRequestingPermission(true)
        await requestPermission()
        setIsRequestingPermission(false)
      }
    }

    if (permission === null || !permission?.granted) {
      getPermission()
    }
  }, [permission, requestPermission, isRequestingPermission, dialog, t, navigation])

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (isProcessing) {
      logger.warn('Already processing, ignoring scan')
      return // 防止重复扫描
    }

    try {
      setIsProcessing(true)
      const qrData = JSON.parse(data)

      if (qrData && qrData.length === 5 && qrData[0] === 'CSA') {
        logger.info(`Compressed QR code detected with ${qrData[2].length} candidates`)
        const connectionInfo = decompressConnectionInfo(qrData as CompressedConnectionInfo)
        onQRCodeScanned({
          type: 'websocket',
          ...connectionInfo
        })
        return
      }

      setIsProcessing(false)
    } catch (error) {
      logger.error('Failed to parse QR code data:', error)
      setIsProcessing(false)
    }
  }

  if (permission === null || isRequestingPermission) {
    return (
      <Container>
        <YStack className="flex-1 items-center justify-center">
          <Spinner />
          <Text className="mt-2">
            {t('settings.data.landrop.scan_qr_code.requesting_permission') || 'Requesting camera permission...'}
          </Text>
        </YStack>
      </Container>
    )
  }

  if (!permission.granted) {
    return (
      <Container className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </Container>
    )
  }

  return (
    <Container>
      <XStack className="items-center gap-1">
        <ScanQrCode />
        <Text>{t('settings.data.landrop.scan_qr_code.description')}</Text>
      </XStack>

      <CameraView
        style={{
          width: '100%',
          height: '100%',
          minHeight: 300
        }}
        facing="back"
        onBarcodeScanned={
          isProcessing
            ? undefined
            : data => {
                handleBarcodeScanned(data)
              }
        }
        barcodeScannerSettings={{
          barcodeTypes: ['qr']
        }}
      />
      <Overlay />
      {isProcessing && (
        <YStack
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
          <Spinner />
          <Text className="mt-4 text-lg text-white">
            {t('settings.data.landrop.scan_qr_code.processing') || 'Processing QR code...'}
          </Text>
        </YStack>
      )}
    </Container>
  )
}
