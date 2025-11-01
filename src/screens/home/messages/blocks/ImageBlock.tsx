import React, { memo } from 'react'

import { ImageItem, ImageSkeleton } from '@/componentsV2'
import type { ImageMessageBlock } from '@/types/message'
import { MessageBlockStatus } from '@/types/message'

interface Props {
  block: ImageMessageBlock
}

const ImageBlock: React.FC<Props> = ({ block }) => {
  if (block.status === MessageBlockStatus.PENDING) return <ImageSkeleton />

  const uploadedFile = block.file

  if (!uploadedFile) {
    return null
  }

  if (uploadedFile) {
    return <ImageItem file={uploadedFile} />
  }

  return null
}

export default memo(ImageBlock)
