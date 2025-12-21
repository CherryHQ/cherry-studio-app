import { BlurView } from 'expo-blur'
import { MotiView } from 'moti'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Platform, StyleSheet, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import type { FileTransferProgress } from '@/types/lanTransfer'

interface ReceiveProgressModalProps {
  isOpen: boolean
  fileTransfer: FileTransferProgress | null
}

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

export function ReceiveProgressModal({ isOpen, fileTransfer }: ReceiveProgressModalProps) {
  const { t } = useTranslation()

  return (
    <Modal animationType="fade" transparent visible={isOpen}>
      <MotiView
        from={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'timing', duration: 300 }}
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
        {/* Android blur is experimental and may not affect content behind native Modal windows. */}
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, styles.androidDim]} />
        ) : (
          <BlurView style={StyleSheet.absoluteFill} intensity={30} experimentalBlurMethod="dimezisBlurView" />
        )}
        <YStack className="bg-card w-3/4 gap-3 overflow-hidden rounded-2xl p-4">
          <YStack className="items-center gap-3">
            <Text className="text-2xl font-bold">{t('settings.data.lan_transfer.receiving')}</Text>
          </YStack>

          {fileTransfer && (
            <YStack className="gap-3">
              <Text className="text-foreground-secondary text-center text-lg" numberOfLines={2}>
                {fileTransfer.fileName}
              </Text>

              <YStack className="bg-background h-2 overflow-hidden rounded-full">
                <View className="bg-primary h-full rounded-full" style={{ width: `${fileTransfer.percentage}%` }} />
              </YStack>

              <XStack className="justify-between">
                <Text className="text-foreground-secondary text-sm">{fileTransfer.percentage}%</Text>
                <Text className="text-foreground-secondary text-sm">
                  {formatBytes(fileTransfer.bytesReceived)} / {formatBytes(fileTransfer.fileSize)}
                </Text>
              </XStack>

              {fileTransfer.estimatedRemainingMs != null && fileTransfer.estimatedRemainingMs > 0 && (
                <Text className="text-foreground-secondary text-center text-sm">
                  {t('settings.data.lan_transfer.eta')}: {formatDuration(fileTransfer.estimatedRemainingMs)}
                </Text>
              )}
            </YStack>
          )}
        </YStack>
      </MotiView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  androidDim: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)'
  }
})
