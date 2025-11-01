import { Accordion, Spinner } from 'heroui-native'
import React from 'react'
import { View } from 'react-native'

import { Text, XStack } from '@/componentsV2'
import { Wrench, XCircle } from '@/componentsV2/icons'
import type { ToolMessageBlock } from '@/types/message'

interface Props {
  block: ToolMessageBlock
}

export default function MessageMcpTool({ block }: Props) {
  const toolResponse = block.metadata?.rawMcpToolResponse

  const { tool, status, response } = toolResponse!
  const isPending = status === 'pending'
  const isDone = status === 'done'
  const isError = status === 'error'

  return (
    <View>
      <Accordion selectionMode="single" variant="default" className="rounded-md">
        <Accordion.Item value="1">
          <Accordion.Trigger className="bg-ui-card-background py-2 dark:bg-ui-card-background-dark">
            <XStack className="flex-1 items-center gap-2">
              {isPending && <Spinner size="sm" />}
              {isDone && <Wrench size={16} />}
              {isError && <XCircle size={16} className="text-red-100 dark:text-red-100" />}
              <Text>{tool.name}</Text>
            </XStack>
            <Accordion.Indicator />
          </Accordion.Trigger>
          <Accordion.Content className="bg-ui-card-background dark:bg-ui-card-background-dark">
            <View>
              <Text>{JSON.stringify(response, null, 2)}</Text>
            </View>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </View>
  )
}
