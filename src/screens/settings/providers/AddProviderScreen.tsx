import { useNavigation } from '@react-navigation/native'
import { Button } from 'heroui-native'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, TouchableWithoutFeedback } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import { Container, HeaderBar, presentDialog, SafeAreaContainer, Text, TextField, XStack, YStack } from '@/componentsV2'
import { ProviderIconButton } from '@/componentsV2/features/SettingsScreen/providers/ProviderIconButton'
import { ProviderSelect } from '@/componentsV2/features/SettingsScreen/providers/ProviderSelect'
import { DEFAULT_ICONS_STORAGE } from '@/constants/storage'
import { uploadFiles } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import { providerService } from '@/services/ProviderService'
import type { Provider, ProviderType } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import type { ProvidersNavigationProps } from '@/types/naviagate'
import { uuid } from '@/utils'

const logger = loggerService.withContext('AddProviderScreen')

export default function AddProviderScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<ProvidersNavigationProps>()

  const [providerId] = useState(() => uuid())
  const [providerName, setProviderName] = useState('')
  const [selectedProviderType, setSelectedProviderType] = useState<ProviderType | undefined>(undefined)
  const [selectedImageFile, setSelectedImageFile] = useState<Omit<FileMetadata, 'md5'> | null>(null)

  const handleImageSelected = (file: Omit<FileMetadata, 'md5'> | null) => {
    setSelectedImageFile(file)
  }

  const uploadProviderImage = async (file: Omit<FileMetadata, 'md5'> | null) => {
    if (file) {
      await uploadFiles([file], DEFAULT_ICONS_STORAGE)
    }
  }

  const createProviderData = (): Provider => {
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
      await providerService.createProvider(providerData)
      navigation.replace('ProviderSettingsScreen', { providerId: providerData.id })
    } catch (error) {
      logger.error('handleSaveProvider', error as Error)
      presentDialog('error', {
        title: t('common.error_occurred'),
        content: error instanceof Error ? error.message : t('common.unknown_error')
      })
    }
  }

  return (
    <SafeAreaContainer>
      <HeaderBar title={t('settings.provider.add.title')} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <Container className="flex-1">
          <KeyboardAvoidingView className="flex-1">
            <YStack className="flex-1 items-center gap-6">
              <ProviderIconButton providerId={providerId} onImageSelected={handleImageSelected} />

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
                pressableFeedbackVariant="ripple"
                variant="tertiary"
                className="secondary-container h-11 w-4/6 rounded-2xl border"
                isDisabled={!providerName.trim()}
                onPress={handleSaveProvider}>
                <Button.Label>
                  <Text className={providerName.trim() ? 'primary-text' : 'text-neutral-60'}>
                    {t('settings.provider.add.title')}
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
