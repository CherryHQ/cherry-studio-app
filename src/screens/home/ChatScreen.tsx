import type { DrawerNavigationProp } from '@react-navigation/drawer'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'
import { PanGestureHandler, State } from 'react-native-gesture-handler'
import { KeyboardAvoidingView, KeyboardController } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SafeAreaContainer, YStack } from '@/componentsV2'
import { ChatScreenHeader } from '@/componentsV2/features/ChatScreen/Header'
import { MessageInputContainer } from '@/componentsV2/features/ChatScreen/MessageInput/MessageInputContainer'
import { CitationSheet } from '@/componentsV2/features/Sheet/CitationSheet'
import { useAssistant } from '@/hooks/useAssistant'
import { useBottom } from '@/hooks/useBottom'
import { usePreference } from '@/hooks/usePreference'
import { useCurrentTopic } from '@/hooks/useTopic'
import type { HomeStackParamList } from '@/navigators/HomeStackNavigator'

import ChatContent from './ChatContent'

KeyboardController.preload()

type ChatScreenNavigationProp = DrawerNavigationProp<any> & StackNavigationProp<HomeStackParamList>

const ChatScreen = () => {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<ChatScreenNavigationProp>()
  const [topicId] = usePreference('topic.current_id')
  const { currentTopic } = useCurrentTopic()

  const { assistant, isLoading: assistantLoading } = useAssistant(currentTopic?.assistantId || '')
  const specificBottom = useBottom()

  // 处理侧滑手势
  const handleSwipeGesture = (event: any) => {
    const { translationX, velocityX, state } = event.nativeEvent

    if (state === State.END) {
      // 右滑 → 打开抽屉
      if (translationX > 0) {
        const hasGoodDistance = translationX > 20
        const hasGoodVelocity = velocityX > 100
        const hasExcellentDistance = translationX > 80

        if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
          navigation.dispatch(DrawerActions.openDrawer())
        }
      }
      // 左滑 → 跳转到 TopicScreen
      else if (translationX < 0) {
        const hasGoodDistance = Math.abs(translationX) > 20
        const hasGoodVelocity = Math.abs(velocityX) > 100
        const hasExcellentDistance = Math.abs(translationX) > 80

        if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
          navigation.navigate('TopicScreen', { assistantId: assistant?.id })
        }
      }
    }
  }

  if (!currentTopic || !assistant || assistantLoading) {
    return (
      <SafeAreaContainer style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 0
      }}>
      <PanGestureHandler
        onGestureEvent={handleSwipeGesture}
        onHandlerStateChange={handleSwipeGesture}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-20, 20]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -20 : -specificBottom}
          behavior="padding">
          <YStack className="flex-1">
            <ChatScreenHeader topic={currentTopic} />

            <View
              style={{
                flex: 1
              }}>
              {/* ChatContent use key to re-render screen content */}
              {/* if remove key, change topic will not re-render */}
              <ChatContent key={topicId} topic={currentTopic} assistant={assistant} />
            </View>
            <MessageInputContainer topic={currentTopic} />
          </YStack>
        </KeyboardAvoidingView>
      </PanGestureHandler>
      <CitationSheet />
    </SafeAreaContainer>
  )
}

export default ChatScreen
