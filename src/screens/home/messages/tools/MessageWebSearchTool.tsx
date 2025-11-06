import React from 'react'

import type { WebSearchToolInput, WebSearchToolOutput } from '@/aiCore/tools/WebSearchTool'
import { Searching, Text, XStack } from '@/componentsV2'
import { Search } from '@/componentsV2/icons/LucideIcon'
import i18n from '@/i18n'
import type { MCPToolResponse } from '@/types/mcp'

export const MessageWebSearchToolTitle = ({ toolResponse }: { toolResponse: MCPToolResponse }) => {
  const toolInput = toolResponse.arguments as WebSearchToolInput
  const toolOutput = toolResponse.response as WebSearchToolOutput
  return toolResponse.status !== 'done' ? (
    <Searching
      text={
        <XStack className="flex-1 items-center gap-2.5 pl-0">
          <Text className="text-sm text-gray-500">{i18n.t('message.searching')}</Text>
          <Text className="max-w-[70%] text-sm text-gray-500" numberOfLines={1} ellipsizeMode="tail">
            {toolInput?.additionalContext ?? ''}
          </Text>
        </XStack>
      }
    />
  ) : (
    <XStack className="items-center gap-1">
      <Search size={16} className=" text-gray-500" />
      <Text className="text-sm text-gray-500">
        {i18n.t('message.websearch.fetch_complete', {
          count: toolOutput?.results?.length ?? 0
        })}
      </Text>
    </XStack>
  )
}
