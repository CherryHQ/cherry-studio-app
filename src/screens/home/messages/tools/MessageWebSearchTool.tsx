import { Search } from '@/componentsV2/icons/LucideIcon'
import React from 'react'
import { Searching, Text, XStack } from '@/componentsV2'

import { WebSearchToolInput, WebSearchToolOutput } from '@/aiCore/tools/WebSearchTool'
import i18n from '@/i18n'
import { MCPToolResponse } from '@/types/mcp'

export const MessageWebSearchToolTitle = ({ toolResponse }: { toolResponse: MCPToolResponse }) => {
  const toolInput = toolResponse.arguments as WebSearchToolInput
  const toolOutput = toolResponse.response as WebSearchToolOutput
  return toolResponse.status !== 'done' ? (
    <Searching
      text={
        <XStack className="flex-1 items-center gap-2.5 pl-0">
          <Text className="text-sm text-gray-500 dark:text-gray-400">{i18n.t('message.searching')}</Text>
          <Text className="max-w-[70%] text-sm text-gray-500 dark:text-gray-400" numberOfLines={1} ellipsizeMode="tail">
            {toolInput?.additionalContext ?? ''}
          </Text>
        </XStack>
      }
    />
  ) : (
    <XStack className="items-center gap-1">
      <Search size={16} className=" text-gray-500 dark:text-gray-400" />
      <Text className="text-sm text-gray-500 dark:text-gray-400">
        {i18n.t('message.websearch.fetch_complete', {
          count: toolOutput?.results?.length ?? 0
        })}
      </Text>
    </XStack>
  )
}
