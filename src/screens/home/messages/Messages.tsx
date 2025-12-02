import type { LegendListRef } from '@legendapp/list'
import { LegendList } from '@legendapp/list'
import { SymbolView } from 'expo-symbols'
import { MotiView } from 'moti'
import type { FC } from 'react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { StyleSheet, View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'

import { YStack } from '@/componentsV2'
import { LiquidGlassButton } from '@/componentsV2/base/LiquidGlassButton'
import { ArrowDown } from '@/componentsV2/icons'
import { useInitialScrollToEnd } from '@/hooks/chat/useInitialScrollToEnd'
import { useTopicBlocks } from '@/hooks/useMessageBlocks'
import { useMessages } from '@/hooks/useMessages'
import { useTheme } from '@/hooks/useTheme'
import type { Assistant, Topic } from '@/types/assistant'
import type { GroupedMessage } from '@/types/message'
import { isIOS } from '@/utils/device'
import { getGroupedMessages } from '@/utils/messageUtils/filters'

import WelcomeContent from '../WelcomeContent'
import MessageGroup from './MessageGroup'

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
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    setShowScrollButton(distanceFromBottom > threshold)
  }

  return (
    <View className="flex-1 py-4">
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
        recycleItems
        maintainScrollAtEnd
        maintainScrollAtEndThreshold={0.1}
        keyboardShouldPersistTaps="never"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<WelcomeContent />}
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
    right: '50%',
    bottom: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  }
})

export default Messages
