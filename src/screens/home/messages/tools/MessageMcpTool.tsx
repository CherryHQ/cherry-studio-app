import { Spinner } from 'heroui-native'
import React, { useCallback } from 'react'
import { Pressable } from 'react-native'

import { Text, XStack } from '@/componentsV2'
import { presentToolCallDetailSheet } from '@/componentsV2/features/Sheet/ToolCallDetailSheet'
import { ChevronDown, CircleCheck, XCircle } from '@/componentsV2/icons'
import type { ToolMessageBlock } from '@/types/message'

interface Props {
  block: ToolMessageBlock
}

export default function MessageMcpTool({ block }: Props) {
  const toolResponse = block.metadata?.rawMcpToolResponse

  const { tool, status, response, arguments: args } = toolResponse!
  const isPending = status === 'pending' || status === 'invoking'
  const isDone = status === 'done'
  const isError = status === 'error'

  const handlePress = useCallback(() => {
    presentToolCallDetailSheet({
      tool,
      arguments: args,
      status,
      response
    })
  }, [tool, args, status, response])

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <XStack className="bg-card items-center justify-between rounded-xl p-2">
        <XStack className="items-center justify-center gap-2">
          {isPending && <Spinner size="sm" />}
          {isDone && <CircleCheck size={16} className="text-green-600" />}
          {isError && <XCircle size={16} className="text-red-600" />}
          <Text className="font-medium">{tool.name}</Text>
        </XStack>
        <ChevronDown />
      </XStack>
    </Pressable>
  )
}
