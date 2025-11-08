import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import { TouchableOpacity } from 'react-native'
import type { EmojiType } from 'rn-emoji-keyboard'
import EmojiPicker from 'rn-emoji-keyboard'

import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'

import Text from '../Text'

interface AvatarEditButtonProps {
  /** 头像内容 - 可以是 emoji 字符串或 React 节点（如图标） */
  content: string | React.ReactNode
  /** 编辑按钮图标 */
  editIcon: React.ReactNode
  /** 头像大小，默认 120 */
  size?: number
  /** 编辑按钮大小，默认 40 */
  editButtonSize?: number
  /** 编辑按钮点击事件 */
  onEditPress?: () => void
  updateAvatar: (avatar: string) => Promise<void>
}

export function AvatarEditButton({
  content,
  editIcon,
  size = 120,
  editButtonSize = 40,
  updateAvatar
}: AvatarEditButtonProps) {
  const { isDark } = useTheme()
  const isEmoji = typeof content === 'string'
  const [isOpen, setIsOpen] = React.useState<boolean>(false)

  const handlePick = async (emoji: EmojiType) => {
    setIsOpen(prev => !prev)
    await updateAvatar(emoji.emoji)
  }

  return (
    <YStack className="relative">
      <TouchableOpacity
        onPress={() => setIsOpen(prev => !prev)}
        className="overflow-hidden rounded-full border-[5px] border-green-100"
        style={{
          width: size,
          height: size,
          justifyContent: 'center',
          alignItems: 'center',
          ...(!isEmoji && {
            paddingTop: 12,
            paddingLeft: 19
          })
        }}>
        {isEmoji ? (
          <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.5 }} className="text-text-primary">
            {content}
          </Text>
        ) : (
          content
        )}
      </TouchableOpacity>

      <YStack
        className="absolute bottom-0 right-0 z-10 rounded-full bg-green-100"
        style={{
          width: editButtonSize,
          height: editButtonSize
        }}>
        <LinearGradient
          colors={['#81df94', '#00B96B']}
          start={[1, 1]}
          end={[0, 0]}
          style={{
            width: editButtonSize,
            height: editButtonSize,
            borderRadius: editButtonSize / 2,
            justifyContent: 'center',
            alignItems: 'center'
          }}>
          {editIcon}
        </LinearGradient>
      </YStack>
      <EmojiPicker
        onEmojiSelected={handlePick}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        categoryPosition="top"
        theme={{
          container: isDark ? '#19191cff' : '#ffffffff',
          header: isDark ? '#f9f9f9ff' : '#202020ff',
          category: {
            icon: '#00b96bff',
            iconActive: '#fff',
            container: isDark ? '#19191cff' : '#ffffffff',
            containerActive: '#00b96bff'
          }
        }}
      />
    </YStack>
  )
}
