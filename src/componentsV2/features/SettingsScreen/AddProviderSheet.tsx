import { BottomSheetBackdrop, BottomSheetModal, BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet'
import { File, Paths } from 'expo-file-system'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Keyboard, TouchableWithoutFeedback } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, useTheme } from 'heroui-native'

import { DEFAULT_ICONS_STORAGE } from '@/constants/storage'
import { useDialog } from '@/hooks/useDialog'
import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import { Provider, ProviderType } from '@/types/assistant'
import { FileMetadata } from '@/types/file'
import { uuid } from '@/utils'
import { YStack, XStack, Text } from '@/componentsV2'
import { ProviderIconButton } from './ProviderIconButton'
import { ProviderSelect } from './ProviderSelect'
import { providerService } from '@/services/ProviderService'

const logger = loggerService.withContext('ProviderSheet')

interface ProviderSheetProps {
  mode?: 'add' | 'edit'
  editProvider?: Provider
}

export const AddProviderSheet = forwardRef<BottomSheetModal, ProviderSheetProps>(
  ({ mode = 'add', editProvider }, ref) => {
    const { t } = useTranslation()
    const { isDark } = useTheme()
    const insets = useSafeAreaInsets()
    const dialog = useDialog()
    const [providerId, setProviderId] = useState(() => editProvider?.id || uuid())

    const [providerName, setProviderName] = useState(editProvider?.name || '')
    const [selectedProviderType, setSelectedProviderType] = useState<ProviderType | undefined>(
      editProvider?.type || undefined
    )
    const [selectedImageFile, setSelectedImageFile] = useState<Omit<FileMetadata, 'md5'> | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    // 当 editProvider 变化时，更新表单字段
    useEffect(() => {
      if (editProvider) {
        setProviderId(editProvider.id)
        setProviderName(editProvider.name || '')
        setSelectedProviderType(editProvider.type || undefined)
      } else {
        setProviderId(uuid())
        setProviderName('')
        setSelectedProviderType(undefined)
      }
    }, [editProvider])

    useEffect(() => {
      if (!isVisible) return

      const backAction = () => {
        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
        return true
      }

      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
      return () => backHandler.remove()
    }, [ref, isVisible])

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
    )

    const handleImageSelected = (file: Omit<FileMetadata, 'md5'> | null) => {
      setSelectedImageFile(file)
    }

    // Helper function to upload provider image
    const uploadProviderImage = async (file: Omit<FileMetadata, 'md5'> | null) => {
      if (file) {
        await uploadFiles([file], DEFAULT_ICONS_STORAGE)
      }
    }

    // Helper function to create provider data
    const createProviderData = (): Provider => {
      if (mode === 'edit' && editProvider) {
        return {
          ...editProvider,
          name: providerName,
          type: selectedProviderType ?? editProvider.type
        }
      }

      return {
        id: providerId,
        type: selectedProviderType ?? 'openai',
        name: providerName,
        apiKey: '',
        apiHost: '',
        models: []
      }
    }

    const handleSaveProvider = async () => {
      try {
        await uploadProviderImage(selectedImageFile)
        const providerData = createProviderData()

        if (mode === 'add') {
          await providerService.createProvider(providerData)
        } else {
          await providerService.updateProvider(providerData.id, providerData)
        }

        ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      } catch (error) {
        logger.error('handleSaveProvider', error as Error)
        dialog.open({
          type: 'error',
          title: t('common.error_occurred'),
          content: error instanceof Error ? error.message : t('common.unknown_error')
        })
      } finally {
        if (mode === 'add') {
          setSelectedProviderType(undefined)
          setProviderName('')
          setSelectedImageFile(null)
        }
      }
    }

    return (
      <BottomSheetModal
        enableDynamicSizing={true}
        ref={ref}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
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
        <BottomSheetView style={{ paddingBottom: insets.bottom }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <YStack className="items-center gap-7 px-5 pb-7">
              <XStack className="w-full items-center justify-center">
                <Text className="text-xl">
                  {mode === 'edit' ? t('settings.provider.edit.title') : t('settings.provider.add.title')}
                </Text>
              </XStack>
              <YStack className="w-full items-center justify-center gap-6">
                <ProviderIconButton
                  providerId={providerId}
                  iconUri={
                    mode === 'edit' ? new File(Paths.join(DEFAULT_ICONS_STORAGE, `${providerId}.png`)).uri : undefined
                  }
                  onImageSelected={handleImageSelected}
                />
                <YStack className="w-full gap-2">
                  <XStack className="gap-2">
                    <Text className="text-text-secondary dark:text-text-secondary-dark">
                      {t('settings.provider.add.name.label')}
                    </Text>
                    <Text className="text-red-500 dark:text-red-500">*</Text>
                  </XStack>
                  <BottomSheetTextInput
                    className="h-10 rounded-md border border-gray-20 bg-ui-card-background px-3 py-3 text-text-secondary dark:bg-ui-card-background-dark dark:text-text-secondary-dark"
                    placeholder={t('settings.provider.add.name.placeholder')}
                    value={providerName}
                    onChangeText={setProviderName}
                  />
                </YStack>
                <YStack className="w-full gap-2">
                  <XStack className="gap-2">
                    <Text className="text-text-secondary dark:text-text-secondary-dark">
                      {t('settings.provider.add.type')}
                    </Text>
                  </XStack>
                  <ProviderSelect
                    value={selectedProviderType}
                    onValueChange={setSelectedProviderType}
                    placeholder={t('settings.provider.add.type')}
                  />
                </YStack>

                <Button
                  variant="tertiary"
                  className="h-11 w-4/6 rounded-lg border-green-20 bg-green-10 dark:border-green-dark-20 dark:bg-green-dark-10"
                  onPress={handleSaveProvider}>
                  <Button.Label>
                    <Text className="text-green-100 dark:text-green-dark-100">
                      {mode === 'edit' ? t('common.save') : t('settings.provider.add.title')}
                    </Text>
                  </Button.Label>
                </Button>
              </YStack>
            </YStack>
          </TouchableWithoutFeedback>
        </BottomSheetView>
      </BottomSheetModal>
    )
  }
)

AddProviderSheet.displayName = 'AddProviderSheet'
