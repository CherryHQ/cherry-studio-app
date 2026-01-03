import type { FC } from 'react'
import React from 'react'
import { View } from 'react-native'

import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'

import FileItem from './FileItem'
import ImageItem from './ImageItem'

interface PreviewItemProps {
  file: FileMetadata
  files: FileMetadata[]
  setFiles: (files: FileMetadata[]) => void
}

const PreviewItem: FC<PreviewItemProps> = ({ file, files, setFiles }) => {
  const handleRemove = () => {
    setFiles(files.filter(f => f.path !== file.path))
  }

  const isImage = file.type === FileTypes.IMAGE

  return (
    <View>
      {isImage ? (
        <ImageItem
          file={file}
          allImages={files.filter(f => f.type === FileTypes.IMAGE)}
          onRemove={handleRemove}
          size={88}
          disabledContextMenu
        />
      ) : (
        <FileItem file={file} onRemove={handleRemove} disabledContextMenu />
      )}
    </View>
  )
}

export { PreviewItem }
