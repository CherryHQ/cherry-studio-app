import React from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Pressable } from 'react-native'
import { Image, Text, YStack } from '@/componentsV2'
import FastSquircleView from 'react-native-fast-squircle'

const WelcomeContent = () => {
  const { t } = useTranslation()

  return (
    <Pressable className="h-full w-full flex-1 items-center justify-center" onPress={() => Keyboard.dismiss()}>
      <YStack className="items-center justify-center">
        <FastSquircleView
          style={{
            width: 144,
            height: 144,
            borderRadius: 35,
            overflow: 'hidden'
          }}
          cornerSmoothing={0.6}>
          <Image className="h-full w-full" source={require('@/assets/images/favicon.png')} />
        </FastSquircleView>
        <Text className="text-primary mt-5 text-[18px] font-bold">{t('chat.title')}</Text>
      </YStack>
    </Pressable>
  )
}

export default WelcomeContent
