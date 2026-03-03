import type { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'

import { Container, DrawerGestureWrapper, HeaderBar, SafeAreaContainer, Text } from '@/componentsV2'
import { useAssistant } from '@/hooks/useAssistant'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { useCurrentTopic } from '@/hooks/useTopic'
import AssistantDetailTabNavigator from '@/navigators/AssistantDetailTabNavigator'
import type { AssistantDetailScreenParams, DrawerNavigationProps } from '@/types/naviagate'

type AssistantDetailRouteProp = RouteProp<
  { AssistantDetailScreen: AssistantDetailScreenParams },
  'AssistantDetailScreen'
>

export default function AssistantDetailScreen() {
  const { t } = useTranslation()

  const route = useRoute<AssistantDetailRouteProp>()
  const navigation = useNavigation<DrawerNavigationProps>()
  const { assistantId, returnTo, topicId, tab } = route.params
  const { assistant, isLoading } = useAssistant(assistantId)
  const panGesture = useSwipeGesture()
  const { currentTopicId } = useCurrentTopic()

  const handleBackPress = React.useCallback(() => {
    if (returnTo === 'chat') {
      if (navigation.canGoBack()) {
        navigation.goBack()
        return
      }

      const targetTopicId = topicId || currentTopicId
      if (targetTopicId) {
        navigation.navigate('Home', { screen: 'ChatScreen', params: { topicId: targetTopicId } })
      } else {
        navigation.navigate('Home', { screen: 'TopicScreen' })
      }
      return
    }
    navigation.goBack()
  }, [currentTopicId, navigation, returnTo, topicId])

  if (isLoading) {
    return (
      <SafeAreaContainer className="items-center justify-center">
        <DrawerGestureWrapper>
          <View collapsable={false} className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        </DrawerGestureWrapper>
      </SafeAreaContainer>
    )
  }

  if (!assistant) {
    return (
      <SafeAreaContainer className="flex-1 items-center justify-center">
        <DrawerGestureWrapper>
          <View collapsable={false} className="flex-1 items-center justify-center">
            <Text>{t('assistants.error.notFound')}</Text>
          </View>
        </DrawerGestureWrapper>
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer>
      <GestureDetector gesture={panGesture}>
        <View collapsable={false} className="flex-1">
          <HeaderBar
            title={!assistant?.emoji ? t('assistants.title.create') : t('assistants.title.edit')}
            onBackPress={handleBackPress}
          />
          <View className="flex-1">
            <Container>
              {/* Material Top Tabs Navigator */}
              <View className="flex-1">
                <AssistantDetailTabNavigator assistant={assistant} initialTab={tab} />
              </View>
            </Container>
          </View>
        </View>
      </GestureDetector>
    </SafeAreaContainer>
  )
}
