import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from 'heroui-native'
import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { MarqueeComponent } from '@/componentsV2'
import type { ThinkingMessageBlock } from '@/types/message'

import ReactNativeMarkdown from '../../markdown/ReactNativeMarkdown'

interface Props {
  block: ThinkingMessageBlock
}

const ThinkingBlock: React.FC<Props> = ({ block }) => {
  const { isDark } = useTheme()
  const [expanded, setExpanded] = useState(false)

  const toggleExpanded = () => {
    setExpanded(!expanded)
  }

  const gradientColors = isDark
    ? ['rgba(2,111,180,0.22)', 'rgba(9,125,149,0.1)', 'rgba(18,73,109,0.2)'] // 暗色主题
    : ['rgba(146,231,255,0.5)', 'rgba(206,232,255,0.5)', 'rgba(206,232,255,0.5)'] // 亮色主题

  const borderColor = isDark ? 'rgba(0,103,168,0.5)' : 'rgba(80,183,255,1)'

  return (
    <View style={[styles.wrapper, { borderColor }]}>
      <LinearGradient
        colors={gradientColors as any}
        locations={[0, 0.61, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}>
        <Pressable onPress={toggleExpanded} style={styles.headerPressable}>
          <MarqueeComponent block={block} expanded={expanded} />
        </Pressable>
        {expanded && (
          <View style={styles.contentContainer}>
            <ReactNativeMarkdown block={block} />
          </View>
        )}
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 0.7,
    overflow: 'hidden'
  },
  headerPressable: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  }
})

export default ThinkingBlock
