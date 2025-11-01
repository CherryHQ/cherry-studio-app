import React from 'react'

import { ToolMessageBlock } from '@/types/message'

import MessageTool from './MessageTool'

interface Props {
  block: ToolMessageBlock
}

export default function MessageTools({ block }: Props) {
  const toolResponse = block.metadata?.rawMcpToolResponse
  if (!toolResponse) return null

  // if (tool.type === 'mcp') {
  //   return <MessageMcpTool block={block} />
  // }

  return <MessageTool block={block} />
}
