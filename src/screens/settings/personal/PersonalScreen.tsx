import * as ImagePicker from 'expo-image-picker'
import { Card } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import {
  Container,
  HeaderBar,
  Image,
  presentDialog,
  SafeAreaContainer,
  Text,
  TextField,
  XStack,
  YStack
} from '@/componentsV2'
import { Camera, CircleUserRound } from '@/componentsV2/icons/LucideIcon'
import { useSettings } from '@/hooks/useSettings'
import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('PersonalScreen')

export default function PersonalScreen() {
  const { t } = useTranslation()
  const { avatar, userName, setAvatar, setUserName } = useSettings()

  const handleAvatarPress = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        base64: true,
        quality: 0.8
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0]

        if (selectedImage.base64) {
          const base64Image = `data:image/jpeg;base64,${selectedImage.base64}`
          await setAvatar(base64Image)
        }
      }
    } catch (error) {
      presentDialog('error', {
        title: 'Error',
        content: 'Failed to pick image'
      })
      logger.error('handleAvatarPress', error as Error)
    }
  }

  return (
    <SafeAreaContainer>
      <HeaderBar title={t('settings.personal.title')} />
      <Container>
        <Card className="bg-card rounded-2xl p-4">
          <YStack className="gap-6">
            <XStack className="mt-2 items-center justify-center">
              <Pressable onPress={handleAvatarPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                <XStack className="relative">
                  <Image
                    className="h-24 w-24 rounded-full"
                    source={avatar ? { uri: avatar } : require('@/assets/images/favicon.png')}
                  />
                  <XStack className="absolute bottom-0 right-0 rounded-full border-2 border-white bg-sky-500 p-1.5">
                    <Camera className="text-white" size={14} />
                  </XStack>
                </XStack>
              </Pressable>
            </XStack>

            <XStack className="items-center justify-between gap-2 rounded-2xl py-0 pl-3.5">
              <XStack className="items-center gap-1.5">
                <CircleUserRound />
                <Text>{t('settings.personal.name')}</Text>
              </XStack>

              <TextField className="flex-1">
                <TextField.Input
                  className="rounded-xl"
                  value={userName}
                  onChangeText={setUserName}
                  placeholder={t('settings.personal.namePlaceholder')}
                />
              </TextField>
            </XStack>
          </YStack>
        </Card>
      </Container>
    </SafeAreaContainer>
  )
}
