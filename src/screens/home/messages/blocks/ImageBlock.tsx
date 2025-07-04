import React, { memo } from 'react'
import { View } from 'tamagui'

import ImageItem from '@/components/message-input/preview-items/ImageItem'
import { ImageMessageBlock } from '@/types/message'

interface Props {
  block: ImageMessageBlock
}

const ImageBlock: React.FC<Props> = ({ block }) => {
  if (!block.file) {
    return null
  }

  return (
    <View>
      <ImageItem file={block.file} />
    </View>
  )
}

export default memo(ImageBlock)
