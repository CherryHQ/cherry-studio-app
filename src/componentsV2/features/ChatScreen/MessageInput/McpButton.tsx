import React, { useRef } from 'react'

import { Hammer } from '@/componentsV2/icons'
import { IconButton } from '@/componentsV2/base/IconButton'
import { McpServerSheet } from '../../Sheet/McpServerSheet'
import { Assistant } from '@/types/assistant'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import XStack from '@/componentsV2/layout/XStack'
import Text from '@/componentsV2/base/Text'
import { Keyboard } from 'react-native'

interface McpButtonProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export const McpButton: React.FC<McpButtonProps> = ({ assistant, updateAssistant }) => {
  const mcpServerSheetRef = useRef<BottomSheetModal>(null)

  const openMcpServerSheet = () => {
    Keyboard.dismiss()
    mcpServerSheetRef.current?.present()
  }

  const McpIconContent = () => {
    if (assistant.mcpServers?.length && assistant.mcpServers?.length > 0) {
      return (
        <XStack className="items-center justify-between gap-1 rounded-xl border-[0.5px] border-green-20 bg-green-10 px-2 py-1 dark:border-green-dark-20 dark:bg-green-dark-10">
          <Hammer size={20} className="text-green-100 dark:text-green-dark-100" />
          <Text className="text-green-100 dark:text-green-dark-100">{assistant.mcpServers?.length}</Text>
        </XStack>
      )
    }
    return <Hammer size={20} />
  }

  return (
    <>
      <IconButton icon={<McpIconContent />} onPress={openMcpServerSheet} />
      <McpServerSheet ref={mcpServerSheetRef} assistant={assistant} updateAssistant={updateAssistant} />
    </>
  )
}
