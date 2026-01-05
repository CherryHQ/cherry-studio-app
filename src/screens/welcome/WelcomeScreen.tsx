import { useNavigation } from '@react-navigation/native'
import { Button } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import FastSquircleView from 'react-native-fast-squircle'

import { Image, SafeAreaContainer, YStack } from '@/componentsV2'
import { useAppState } from '@/hooks/useAppState'
import { useCurrentTopic } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { topicService } from '@/services/TopicService'
import type { RootNavigationProps } from '@/types/naviagate'

import { presentImportDataSheet } from './ImportDataSheet'
import WelcomeTitle from './WelcomeTitle'

export default function WelcomeScreen() {
  const navigation = useNavigation<RootNavigationProps>()
  const { setWelcomeShown } = useAppState()
  const { switchTopic } = useCurrentTopic()
  const { t } = useTranslation()

  const handleStart = async () => {
    const defaultAssistant = await getDefaultAssistant()
    const newTopic = await topicService.createTopic(defaultAssistant)
    navigation.navigate('HomeScreen', {
      screen: 'Home',
      params: {
        screen: 'ChatScreen',
        params: { topicId: newTopic.id }
      }
    })
    await switchTopic(newTopic.id)
    await setWelcomeShown(true)
  }

  const handleImportData = () => {
    presentImportDataSheet({ handleStart })
  }

  return (
    <>
      <SafeAreaContainer style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 0 }}>
        <View className="flex-1 items-center justify-center gap-5">
          <FastSquircleView
            style={{
              width: 176,
              height: 176,
              borderRadius: 35,
              overflow: 'hidden'
            }}
            cornerSmoothing={0.6}>
            <Image className="h-full w-full" source={require('@/assets/images/favicon.png')} />
          </FastSquircleView>
          <View className="items-center justify-center px-4">
            <View className="flex-row flex-wrap items-center justify-center">
              <WelcomeTitle className="text-center text-2xl font-bold" />
              <View className="bg-primary-text ml-2 h-7 w-7 rounded-full" />
            </View>
          </View>
        </View>
        {/* register and login*/}
        <View className="bg-card h-1/4 w-full items-center justify-center">
          <YStack className="flex-1 items-center justify-center gap-5">
            <Button
              pressableFeedbackVariant="ripple"
              className="w-3/4 rounded-lg"
              variant="secondary"
              onPress={handleImportData}>
              <Button.Label className="text-foreground w-full text-center text-lg">
                {t('common.import_from_cherry_studio')}
              </Button.Label>
            </Button>

            <Button
              pressableFeedbackVariant="ripple"
              className="w-3/4 rounded-lg"
              variant="secondary"
              onPress={handleStart}>
              <Button.Label className="text-foreground w-full text-center text-lg">{t('common.start')}</Button.Label>
            </Button>
          </YStack>
        </View>
      </SafeAreaContainer>
    </>
  )
}
