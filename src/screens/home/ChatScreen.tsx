import { DrawerNavigationProp } from '@react-navigation/drawer'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { ActivityIndicator, Platform, View } from 'react-native'
import { PanGestureHandler, State } from 'react-native-gesture-handler'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { YStack, SafeAreaContainer } from '@/componentsV2'
import { MessageInputContainer } from '@/componentsV2/features/ChatScreen/MessageInput/MessageInputContainer'

import { useAssistant } from '@/hooks/useAssistant'
import { useBottom } from '@/hooks/useBottom'
import { usePreference } from '@/hooks/usePreference'
import { useCurrentTopic } from '@/hooks/useTopic'

import ChatContent from './ChatContent'
import { ChatScreenHeader } from '@/componentsV2/features/ChatScreen/Header'
import React from 'react'

const ChatScreen = () => {
  const navigation = useNavigation<DrawerNavigationProp<any>>()
  const [topicId] = usePreference('topic.current_id')
  const { currentTopic } = useCurrentTopic()

  const { assistant, isLoading: assistantLoading } = useAssistant(currentTopic?.assistantId || '')
  const specificBottom = useBottom()

  // 处理侧滑手势
  const handleSwipeGesture = (event: any) => {
    const { translationX, velocityX, state } = event.nativeEvent

    // 检测向右滑动
    if (state === State.END) {
      // 全屏可侧滑触发：滑动距离大于20且速度大于100，或者滑动距离大于80
      const hasGoodDistance = translationX > 20
      const hasGoodVelocity = velocityX > 100
      const hasExcellentDistance = translationX > 80

      if ((hasGoodDistance && hasGoodVelocity) || hasExcellentDistance) {
        navigation.dispatch(DrawerActions.openDrawer())
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
    <SafeAreaContainer style={{ paddingBottom: 0 }}>
      <PanGestureHandler
        onGestureEvent={handleSwipeGesture}
        onHandlerStateChange={handleSwipeGesture}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-20, 20]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -20 : -specificBottom}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
    </SafeAreaContainer>
  )
}

export default ChatScreen
