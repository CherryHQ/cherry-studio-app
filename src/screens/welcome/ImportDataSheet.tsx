import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, View } from 'react-native'

import { Group, PressableRow, RestoreProgressModal, Text, XStack } from '@/componentsV2'
import { Folder, Wifi } from '@/componentsV2/icons'
import { useBottom } from '@/hooks/useBottom'
import { DEFAULT_RESTORE_STEPS, useRestore } from '@/hooks/useRestore'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import type { RootNavigationProps } from '@/types/naviagate'
import { isIOS26 } from '@/utils/device'

const logger = loggerService.withContext('ImportDataSheet')

const SHEET_NAME = 'import-data-sheet'

interface ImportDataSheetData {
  handleStart: () => Promise<void>
}

const defaultImportDataSheetData: ImportDataSheetData = {
  handleStart: async () => {}
}

let currentSheetData: ImportDataSheetData = defaultImportDataSheetData
let updateSheetDataCallback: ((data: ImportDataSheetData) => void) | null = null

export const presentImportDataSheet = (data: ImportDataSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissImportDataSheet = () => TrueSheet.dismiss(SHEET_NAME)

export const ImportDataSheet: React.FC = () => {
  const [sheetData, setSheetData] = useState<ImportDataSheetData>(currentSheetData)
  const { handleStart } = sheetData
  const { t } = useTranslation()
  const navigation = useNavigation<RootNavigationProps>()
  const bottom = useBottom()
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal } = useRestore({
    stepConfigs: DEFAULT_RESTORE_STEPS,
    clearBeforeRestore: true
  })

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissImportDataSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handleRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/zip' })
      if (result.canceled) return

      const asset = result.assets[0]
      await startRestore({
        name: asset.name,
        uri: asset.uri,
        size: asset.size,
        mimeType: asset.mimeType
      })
    } catch (error) {
      logger.error('Failed to restore data:', error)
    } finally {
      dismissImportDataSheet()
    }
  }

  const handleLanTransfer = () => {
    dismissImportDataSheet()
    navigation.navigate('HomeScreen', {
      screen: 'Home',
      params: {
        screen: 'DataSourcesSettings',
        params: {
          screen: 'LanTransferScreen',
          params: { redirectToHome: true }
        }
      }
    })
  }

  const handleCloseModal = () => {
    closeModal()
    handleStart()
  }

  return (
    <>
      <TrueSheet
        name={SHEET_NAME}
        detents={[0.28]}
        cornerRadius={30}
        grabber={Platform.OS === 'ios' ? true : false}
        dismissible
        dimmed
        backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
        onDidDismiss={() => setIsVisible(false)}
        onDidPresent={() => setIsVisible(true)}>
        <View className="gap-5 overflow-hidden p-4 pt-5" style={{ paddingBottom: bottom }}>
          <Group className="bg-zinc-400/10">
            <PressableRow onPress={handleRestore}>
              <XStack className="items-center gap-3">
                <Folder size={24} />
                <Text>{t('settings.data.restore.title')}</Text>
              </XStack>
            </PressableRow>
            <PressableRow onPress={handleLanTransfer}>
              <XStack className="items-center gap-3">
                <Wifi size={24} />
                <Text>{t('settings.data.lan_transfer.title')}</Text>
              </XStack>
            </PressableRow>
          </Group>
        </View>
      </TrueSheet>
      <RestoreProgressModal
        isOpen={isModalOpen}
        steps={restoreSteps}
        overallStatus={overallStatus}
        onClose={handleCloseModal}
      />
    </>
  )
}

ImportDataSheet.displayName = 'ImportDataSheet'
