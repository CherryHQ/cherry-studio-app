import { BlurView } from 'expo-blur'
import { cn, useTheme } from 'heroui-native'
import React from 'react'
import { Platform, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import YStack from '@/componentsV2/layout/YStack'
import { formateEmoji } from '@/utils/formats'

interface EmojiAvatarProps {
  emoji?: string
  size?: number
  borderWidth?: number
  borderColor?: string
  borderRadius?: number
  blurIntensity?: number
}

const EmojiAvatar = ({
  emoji,
  size = 80,
  borderWidth = 4,
  borderColor = '$backgroundPrimary',
  borderRadius,
  blurIntensity = 80
}: EmojiAvatarProps) => {
  const { isDark } = useTheme()

  return (
    <View
      className={cn('relative items-center justify-center overflow-hidden')}
      style={{
        height: size,
        width: size,
        borderWidth,
        borderColor,
        borderRadius: borderRadius || size / 2
      }}>
      {/* 背景模糊emoji */}
      <YStack
        className="absolute inset-0 origin-center scale-[2] items-center justify-center"
        style={{
          height: size - borderWidth * 2,
          width: size - borderWidth * 2
        }}>
        <Text className="opacity-30" style={{ fontSize: size * 0.7 }}>
          {formateEmoji(emoji)}
        </Text>
      </YStack>
      {/* BlurView模糊层 */}
      <BlurView
        intensity={blurIntensity}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
        tint={isDark ? 'dark' : 'light'}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: size / 2
        }}
      />
      {/* 前景清晰emoji */}
      <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.8 }}>{formateEmoji(emoji)}</Text>
    </View>
  )
}

export default EmojiAvatar
