import React from 'react'

import type { ToolMessageBlock } from '@/types/message'

import MessageTools from '../tools/MessageTools'

interface Props {
  block: ToolMessageBlock
}

const ToolBlock: React.FC<Props> = ({ block }) => {
  return <MessageTools block={block} />
}

export default React.memo(ToolBlock)
