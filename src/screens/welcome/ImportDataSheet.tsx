import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { useNavigation } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, View } from 'react-native'

import { Container, Group, PressableRow, RestoreProgressModal, Text, XStack } from '@/componentsV2'
import { Folder, Wifi } from '@/componentsV2/icons'
import { useBottom } from '@/hooks/useBottom'
import { DEFAULT_RESTORE_STEPS, useRestore } from '@/hooks/useRestore'
import { loggerService } from '@/services/LoggerService'
import type { WelcomeNavigationProps } from '@/types/naviagate'

const logger = loggerService.withContext('ImportDataSheet')

const SHEET_NAME = 'import-data-sheet'

export const presentImportDataSheet = () => TrueSheet.present(SHEET_NAME)
export const dismissImportDataSheet = () => TrueSheet.dismiss(SHEET_NAME)

interface ImportDataSheetProps {
  handleStart: () => Promise<void>
}

export const ImportDataSheet: React.FC<ImportDataSheetProps> = ({ handleStart }) => {
  const { t } = useTranslation()
  const bottom = useBottom()
  const navigation = useNavigation<WelcomeNavigationProps>()
  const [isVisible, setIsVisible] = useState(false)
  const { isModalOpen, restoreSteps, overallStatus, startRestore, closeModal } = useRestore({
    stepConfigs: DEFAULT_RESTORE_STEPS
  })

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

  const handleCloseModal = () => {
    closeModal()
    handleStart()
  }

  const handleNavigateToLandrop = () => {
    dismissImportDataSheet()
    navigation.navigate('LandropSettingsScreen', { redirectToHome: true })
  }

  return (
    <>
      <TrueSheet
        name={SHEET_NAME}
        detents={['auto']}
        cornerRadius={30}
        grabber
        dismissible
        dimmed
        onDidDismiss={() => setIsVisible(false)}
        onDidPresent={() => setIsVisible(true)}>
        <View style={{ paddingBottom: bottom }}>
          <Container>
            <Group>
              <PressableRow onPress={handleRestore}>
                <XStack className="items-center gap-3">
                  <Folder size={24} />
                  <Text>{t('settings.data.restore.title')}</Text>
                </XStack>
              </PressableRow>
              <PressableRow onPress={handleNavigateToLandrop}>
                <XStack className="items-center gap-3">
                  <Wifi size={24} />
                  <Text>{t('settings.data.landrop.title')}</Text>
                </XStack>
              </PressableRow>
            </Group>
          </Container>
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
