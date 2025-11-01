import React, { memo } from 'react'

import { FileItem } from '@/componentsV2'
import type { FileMessageBlock } from '@/types/message'

interface Props {
  block: FileMessageBlock
}

const FileBlock: React.FC<Props> = ({ block }) => {
  return <FileItem file={block.file} />
}

export default memo(FileBlock)
