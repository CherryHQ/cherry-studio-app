import type { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { File, Paths } from 'expo-file-system'
import { Button } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, TouchableWithoutFeedback } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import { Container, HeaderBar, SafeAreaContainer, Text, TextField, XStack, YStack } from '@/componentsV2'
import { ProviderIconButton } from '@/componentsV2/features/SettingsScreen/ProviderIconButton'
import { ProviderSelect } from '@/componentsV2/features/SettingsScreen/ProviderSelect'
import { DEFAULT_ICONS_STORAGE } from '@/constants/storage'
import { useDialog } from '@/hooks/useDialog'
import { useProvider } from '@/hooks/useProviders'
import type { ProvidersStackParamList } from '@/navigators/settings/ProvidersStackNavigator'
import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import { providerService } from '@/services/ProviderService'
import type { Provider, ProviderType } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import type { ProvidersNavigationProps } from '@/types/naviagate'
import { uuid } from '@/utils'

const logger = loggerService.withContext('AddProviderScreen')

type AddProviderScreenRouteProp = RouteProp<ProvidersStackParamList, 'AddProviderScreen'>

export default function AddProviderScreen() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const navigation = useNavigation<ProvidersNavigationProps>()
  const route = useRoute<AddProviderScreenRouteProp>()

  const mode = route.params?.mode ?? 'add'
  const editProviderId = route.params?.providerId

  // Load existing provider data in edit mode
  const { provider: editProvider } = useProvider(editProviderId ?? '')

  const [providerId, setProviderId] = useState(() => editProviderId || uuid())
  const [providerName, setProviderName] = useState('')
  const [selectedProviderType, setSelectedProviderType] = useState<ProviderType | undefined>(undefined)
  const [selectedImageFile, setSelectedImageFile] = useState<Omit<FileMetadata, 'md5'> | null>(null)
  const [existingIconUri, setExistingIconUri] = useState<string | undefined>(undefined)

  // Update form fields when editProvider is loaded
  useEffect(() => {
    if (mode === 'edit' && editProvider) {
      setProviderId(editProvider.id)
      setProviderName(editProvider.name || '')
      setSelectedProviderType(editProvider.type || undefined)
    }
  }, [mode, editProvider])

  // Find existing icon file in edit mode
  useEffect(() => {
    if (mode === 'edit' && providerId) {
      const possibleExtensions = ['png', 'jpg', 'jpeg']
      for (const ext of possibleExtensions) {
        const file = new File(Paths.join(DEFAULT_ICONS_STORAGE, `${providerId}.${ext}`))
        if (file.exists) {
          setExistingIconUri(file.uri)
          return
        }
      }
      setExistingIconUri(undefined)
    }
  }, [mode, providerId])

  const handleImageSelected = (file: Omit<FileMetadata, 'md5'> | null) => {
    setSelectedImageFile(file)
  }

  const uploadProviderImage = async (file: Omit<FileMetadata, 'md5'> | null) => {
    if (file) {
      await uploadFiles([file], DEFAULT_ICONS_STORAGE)
    }
  }

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
      Keyboard.dismiss()
      await uploadProviderImage(selectedImageFile)
      const providerData = createProviderData()

      if (mode === 'add') {
        await providerService.createProvider(providerData)
        // Navigate to settings screen after creating
        navigation.replace('ProviderSettingsScreen', { providerId: providerData.id })
      } else {
        await providerService.updateProvider(providerData.id, providerData)
        // Go back to list after editing
        navigation.goBack()
      }
    } catch (error) {
      logger.error('handleSaveProvider', error as Error)
      dialog.open({
        type: 'error',
        title: t('common.error_occurred'),
        content: error instanceof Error ? error.message : t('common.unknown_error')
      })
    }
  }

  return (
    <SafeAreaContainer>
      <HeaderBar title={mode === 'edit' ? t('settings.provider.edit.title') : t('settings.provider.add.title')} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <Container className="flex-1">
          <KeyboardAvoidingView className="flex-1">
            <YStack className="flex-1 items-center gap-6">
              <ProviderIconButton
                providerId={providerId}
                iconUri={mode === 'edit' ? existingIconUri : undefined}
                onImageSelected={handleImageSelected}
              />

              <YStack className="w-full gap-2">
                <XStack className="flex items-center gap-2">
                  <XStack className="w-1/3">
                    <Text className="text-foreground-secondary">{t('settings.provider.add.name.label')}</Text>
                    <Text className="text-red-500">*</Text>
                  </XStack>
                  <TextField className="flex-1">
                    <TextField.Input
                      className="rounded-md"
                      placeholder={t('settings.provider.add.name.placeholder')}
                      value={providerName}
                      onChangeText={setProviderName}
                    />
                  </TextField>
                </XStack>
              </YStack>

              <YStack className="w-full gap-2">
                <XStack className="flex items-center gap-2">
                  <Text className="text-foreground-secondary w-1/3">{t('settings.provider.add.type')}</Text>
                  <XStack className="flex-1">
                    <ProviderSelect
                      value={selectedProviderType}
                      onValueChange={setSelectedProviderType}
                      placeholder={t('settings.provider.add.type')}
                    />
                  </XStack>
                </XStack>
              </YStack>

              <Button
                feedbackVariant="ripple"
                variant="tertiary"
                className="border-brand-300/30 bg-brand-300/5 h-11 w-4/6 rounded-2xl"
                isDisabled={!providerName.trim()}
                onPress={handleSaveProvider}>
                <Button.Label>
                  <Text className={providerName.trim() ? 'text-brand-300' : 'text-neutral-60'}>
                    {mode === 'edit' ? t('common.save') : t('settings.provider.add.title')}
                  </Text>
                </Button.Label>
              </Button>
            </YStack>
          </KeyboardAvoidingView>
        </Container>
      </TouchableWithoutFeedback>
    </SafeAreaContainer>
  )
}
