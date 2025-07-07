import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, ScrollView, styled, Text, XStack, YStack } from 'tamagui'

import AssistantItemCard from '@/components/assistant/AssistantItemCard'
import { useAssistants } from '@/hooks/useAssistant'
import { Assistant } from '@/types/assistant'
import { NavigationProps } from '@/types/naviagate'

interface WelcomeContentProps {
  onAssistantSelect: (assistant: Assistant) => void
}

const WelcomeContent = ({ onAssistantSelect }: WelcomeContentProps) => {
  const { t } = useTranslation()
  const navigation = useNavigation<NavigationProps>()
  const { assistants: systemAssistants } = useAssistants()

  const handleSeeAllPress = () => {
    navigation.navigate('AssistantMarketScreen')
  }

  return (
    <>
      {/* assistant market(Temporary) */}
      <YStack gap={17} paddingHorizontal={20} paddingTop={40}>
        <XStack justifyContent="space-between">
          <Text>{t('assistants.market.popular')}</Text>
          <Text onPress={handleSeeAllPress}>{t('common.see_all')}</Text>
        </XStack>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap={20}>
            {systemAssistants.slice(0, 3).map(assistant => (
              <AssistantItemCard
                key={assistant.id}
                assistant={assistant}
                setIsBottomSheetOpen={() => {}}
                onAssistantPress={() => onAssistantSelect(assistant)}
              />
            ))}
          </XStack>
        </ScrollView>
      </YStack>

      {/* 主要内容区域 */}
      <ContentContainer>
        <Image
          source={require('@/assets/images/adaptive-icon.png')}
          width={100}
          height={100}
          resizeMode="contain"
          borderRadius={50}
          overflow="hidden"
        />
        <YStack alignItems="center" space="$2">
          <Text fontSize="$3" color="$color11" textAlign="center" maxWidth={300}>
            {t('chat.welcome')}
          </Text>
        </YStack>
      </ContentContainer>
    </>
  )
}

const ContentContainer = styled(YStack, {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center'
})

export default WelcomeContent
