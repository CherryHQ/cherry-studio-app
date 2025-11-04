import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { useNavigation } from '@react-navigation/native'
import * as DocumentPicker from 'expo-document-picker'
import { useTheme } from 'heroui-native'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler } from 'react-native'

import { Container, Group, PressableRow, RestoreProgressModal, Text, XStack } from '@/componentsV2'
import { Folder, Wifi } from '@/componentsV2/icons'
import { useBottom } from '@/hooks/useBottom'
import { DEFAULT_RESTORE_STEPS, useRestore } from '@/hooks/useRestore'
import { loggerService } from '@/services/LoggerService'
import type { WelcomeNavigationProps } from '@/types/naviagate'

const logger = loggerService.withContext('ImportDataSheet')

interface ImportDataSheetProps {
  handleStart: () => Promise<void>
}

export const ImportDataSheet = forwardRef<BottomSheetModal, ImportDataSheetProps>(({ handleStart }, ref) => {
  const { isDark } = useTheme()
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
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [ref, isVisible])

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
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    }
  }

  const handleCloseModal = () => {
    closeModal()
    handleStart()
  }

  const handleNavigateToLandrop = () => {
    ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
    navigation.navigate('LandropSettingsScreen', { redirectToHome: true })
  }

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <>
      <BottomSheetModal
        enableDynamicSizing={true}
        ref={ref}
        backgroundStyle={{
          borderRadius: 30,
          backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
        }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
        }}
        backdropComponent={renderBackdrop}
        onDismiss={() => setIsVisible(false)}
        onChange={index => setIsVisible(index >= 0)}>
        <BottomSheetView style={{ paddingBottom: bottom }}>
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
        </BottomSheetView>
      </BottomSheetModal>
      <RestoreProgressModal
        isOpen={isModalOpen}
        steps={restoreSteps}
        overallStatus={overallStatus}
        onClose={handleCloseModal}
      />
    </>
  )
})

ImportDataSheet.displayName = 'ImportDataSheet'
