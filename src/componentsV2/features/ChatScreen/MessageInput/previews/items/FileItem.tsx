import { viewDocument } from '@react-native-documents/viewer'
import type { FC } from 'react'
import React from 'react'
import { View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { TxtIcon } from '@/componentsV2/icons'
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

  // 处理文件名和扩展名
  const fileNameParts = file.name.split('.')
  const fileName = fileNameParts.slice(0, -1).join('.') || file.name // 处理没有扩展名的情况
  const fileExtension = fileNameParts.length > 1 ? fileNameParts.pop()?.toLocaleUpperCase() : ''

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
            <TxtIcon size={32} className="text-blue-500" />
            <View className="flex-1">
              <Text className="w-full text-start text-base font-medium" numberOfLines={1} ellipsizeMode="middle">
                {fileName}
              </Text>
              <Text className="text-foreground-secondary text-sm">
                {formatFileSize(file.size)}
                {fileExtension && ` • ${fileExtension}`}
              </Text>
            </View>
          </View>
        </View>
      )}
    />
  )
}

export default FileItem
