import { viewDocument } from '@react-native-documents/viewer'
import type { FC } from 'react'
import React from 'react'
import { View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { FileText } from '@/componentsV2/icons'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { formatFileSize } from '@/utils/file'

import BaseItem from './BaseItem'

const logger = loggerService.withContext('File Item')

interface FileItemProps {
  file: FileMetadata
  onRemove?: (file: FileMetadata) => void
  size?: number
  disabledContextMenu?: boolean
}

const FileItem: FC<FileItemProps> = ({ file, onRemove, size, disabledContextMenu }) => {
  const handlePreview = () => {
    viewDocument({ uri: file.path, mimeType: file.type }).catch(error => {
      logger.error('Handle Preview Error', error)
    })
  }

  return (
    <BaseItem
      file={file}
      onRemove={onRemove}
      onPress={handlePreview}
      size={size}
      disabledContextMenu={disabledContextMenu}
      renderContent={({ width: height }) => (
        <View
          className="items-center justify-center rounded-2xl bg-zinc-400/20"
          style={{ width: height * 2.5, height: height }}>
          <View className="h-full w-full flex-row items-center gap-3 p-3">
            <FileText />
            <View className="flex-1">
              <Text className="w-full text-start text-base font-medium" numberOfLines={1} ellipsizeMode="middle">
                {file.name}
              </Text>
              <Text className="text-foreground-secondary text-sm">{formatFileSize(file.size)}</Text>
            </View>
          </View>
        </View>
      )}
    />
  )
}

export default FileItem
