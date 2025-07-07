import { useNavigation } from '@react-navigation/native'
import { BookmarkMinus, ChevronDown, Settings2 } from '@tamagui/lucide-icons'
import { BlurView } from 'expo-blur'
import React, { useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { Button, Popover, Text, useWindowDimensions, XStack, YStack } from 'tamagui'

import { useAssistant } from '@/hooks/useAssistant'
import { Assistant } from '@/types/assistant'
import { NavigationProps } from '@/types/naviagate'

import SafeAreaContainer from '../ui/SafeAreaContainer'

interface AssistantDetailsProps {
  assistant: Assistant
  onEdit: () => void
}

/**
 * Renders the detailed view of an assistant inside the popover.
 */
const AssistantDetails: React.FC<AssistantDetailsProps> = ({ assistant, onEdit }) => (
  <YStack gap="$4" padding="$4">
    <XStack justifyContent="space-between" alignItems="center">
      <XStack gap="$3" alignItems="center" flex={1}>
        <Text fontSize={35}>{assistant.emoji}</Text>
        <YStack>
          <Text fontSize={18} fontWeight="bold">
            {assistant.name}
          </Text>
          {assistant.model && <Text color="$gray10">@{assistant.model?.name}</Text>}
        </YStack>
      </XStack>
      <XStack
        gap="$3"
        borderRadius="$10"
        paddingVertical="$1.5"
        paddingHorizontal="$3"
        backgroundColor="rgba(255, 255, 255, 0.1)"
        borderColor="rgba(240, 244, 250, 0.2)"
        borderWidth={0.5}
        alignItems="center">
        <BookmarkMinus size={15} color="$gray11" />
        <Button size="$2" chromeless circular icon={<Settings2 size={15} />} onPress={onEdit} />
      </XStack>
    </XStack>
    <Text fontSize={16} numberOfLines={3} ellipsizeMode="tail">
      {assistant.prompt}
    </Text>
  </YStack>
)

interface AssistantSelectionProps {
  assistantId: string
}

export const AssistantSelection: React.FC<AssistantSelectionProps> = ({ assistantId }) => {
  const [open, setOpen] = useState(false)
  const { width } = useWindowDimensions()
  const navigation = useNavigation<NavigationProps>()
  const { assistant, isLoading } = useAssistant(assistantId)

  const navigateToAssistantDetailScreen = () => {
    if (!assistant) return
    setOpen(false)
    navigation.navigate('AssistantDetailScreen', { assistantId: assistant.id })
  }

  if (isLoading) {
    return (
      <SafeAreaContainer>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  if (!assistant) {
    return <Text>未找到助手。</Text>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button chromeless iconAfter={<ChevronDown size={16} />}>
          <Text fontWeight="bold">{assistant.name}</Text>
        </Button>
      </Popover.Trigger>

      <Popover.Content
        enterStyle={{ y: -10, opacity: 0 }}
        exitStyle={{ y: -10, opacity: 0 }}
        animation="quick"
        width={width}
        padding={0}
        backgroundColor="transparent"
        elevation={0}
        overflow="hidden"
        borderRadius="$3">
        <BlurView intensity={60} tint="default" style={{ width: '100%', height: '100%' }}>
          <AssistantDetails assistant={assistant} onEdit={navigateToAssistantDetailScreen} />
        </BlurView>
      </Popover.Content>
    </Popover>
  )
}
