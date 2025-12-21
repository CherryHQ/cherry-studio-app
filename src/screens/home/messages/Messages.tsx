import type { LegendListRef } from '@legendapp/list'
import { LegendList } from '@legendapp/list'
import { BlurView } from 'expo-blur'
import { SymbolView } from 'expo-symbols'
import { MotiView } from 'moti'
import type { FC } from 'react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSelector } from 'react-redux'

import { YStack } from '@/componentsV2'
import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import { GradientBlurEdge } from '@/componentsV2/features/ChatScreen/GradientBlurEdge'
import { ArrowDown } from '@/componentsV2/icons'
import { useInitialScrollToEnd } from '@/hooks/chat/useInitialScrollToEnd'
import { useTopicBlocks } from '@/hooks/useMessageBlocks'
import { useMessages } from '@/hooks/useMessages'
import { useTheme } from '@/hooks/useTheme'
import type { RootState } from '@/store'
import type { Assistant, Topic } from '@/types/assistant'
import type { GroupedMessage } from '@/types/message'
import { isIOS } from '@/utils/device'
import { getGroupedMessages } from '@/utils/messageUtils/filters'

import WelcomeContent from '../WelcomeContent'
import MessageGroup from './MessageGroup'

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView)

interface MessagesProps {
  assistant: Assistant
  topic: Topic
}

const Messages: FC<MessagesProps> = ({ assistant, topic }) => {
  const { messages } = useMessages(topic.id)
  const { messageBlocks } = useTopicBlocks(topic.id)
  const { isDark } = useTheme()
  const groupedMessages = Object.entries(getGroupedMessages(messages))
  const legendListRef = useRef<LegendListRef>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(false)

  // Editing state
  const editingMessage = useSelector((state: RootState) => state.runtime.editingMessage)
  const isEditing = !!editingMessage

  // Blur animation
  const blurIntensity = useSharedValue(0)

  useEffect(() => {
    blurIntensity.value = withTiming(isEditing ? 10 : 0, { duration: 200 })
  }, [isEditing, blurIntensity])

  const blurAnimatedProps = useAnimatedProps(() => ({
    intensity: blurIntensity.value
  }))

  // Initial scroll to end logic
  const listLayoutReady = useSharedValue(0)
  const hasMessages = groupedMessages.length > 0

  const scrollToEnd = useCallback(
    ({ animated }: { animated: boolean }) => {
      if (legendListRef.current && groupedMessages.length > 0) {
        legendListRef.current.scrollToOffset({
          offset: 9999999,
          animated
        })
      }
    },
    [groupedMessages.length]
  )

  useInitialScrollToEnd(listLayoutReady, scrollToEnd, hasMessages)

  // Trigger scroll when messages are loaded (not on layout)
  useEffect(() => {
    if (hasMessages && listLayoutReady.get() === 0) {
      // Delay to ensure list has rendered
      requestAnimationFrame(() => {
        listLayoutReady.set(1)
      })
    }
  }, [hasMessages, listLayoutReady])

  const renderMessageGroup = ({ item }: { item: [string, GroupedMessage[]] }) => {
    return (
      <MotiView
        from={{
          opacity: 0,
          translateY: 10
        }}
        animate={{
          opacity: 1,
          translateY: 0
        }}
        transition={{
          type: 'timing',
          duration: 300,
          delay: 100
        }}>
        <MessageGroup assistant={assistant} item={item} messageBlocks={messageBlocks} />
      </MotiView>
    )
  }

  const scrollToBottom = useCallback(() => {
    if (legendListRef.current && groupedMessages.length > 0) {
      legendListRef.current.scrollToOffset({ offset: 9999999, animated: true })
    }
  }, [groupedMessages.length])

  const handleScrollToEnd = () => {
    scrollToBottom()
  }

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const threshold = 100
    const edgeThreshold = 10

    // 检测是否在底部
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    setIsAtBottom(distanceFromBottom <= edgeThreshold)
    setShowScrollButton(distanceFromBottom > threshold)
  }

  return (
    <View className="flex-1">
      <LegendList
        ref={legendListRef}
        showsVerticalScrollIndicator={false}
        data={groupedMessages}
        extraData={assistant}
        renderItem={renderMessageGroup}
        keyExtractor={([key, group]) => `${key}-${group[0]?.id}`}
        ItemSeparatorComponent={() => <YStack className="h-5" />}
        contentContainerStyle={{
          flexGrow: 1
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        recycleItems
        maintainScrollAtEnd
        maintainScrollAtEndThreshold={0.1}
        keyboardShouldPersistTaps="never"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<WelcomeContent />}
      />
      <GradientBlurEdge visible={!isAtBottom && groupedMessages.length > 0} />
      <AnimatedBlurView
        animatedProps={blurAnimatedProps}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.blurOverlay, { pointerEvents: isEditing ? 'auto' : 'none' }]}
      />
      {showScrollButton && (
        <MotiView
          key="scroll-to-bottom-button"
          style={styles.fab}
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'timing' }}>
          <LiquidGlassButton size={35} onPress={handleScrollToEnd}>
            {isIOS ? (
              <SymbolView name="arrow.down" size={20} tintColor={isDark ? 'white' : 'black'} />
            ) : (
              <ArrowDown size={24} />
            )}
          </LiquidGlassButton>
        </MotiView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: 'center'
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  }
})

export default Messages
