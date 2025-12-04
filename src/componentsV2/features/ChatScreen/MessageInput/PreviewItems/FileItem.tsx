import { viewDocument } from '@react-native-documents/viewer'
import type { FC } from 'react'
import React from 'react'
import { View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import YStack from '@/componentsV2/layout/YStack'
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
      renderContent={({ width }) => (
        <View className="items-center justify-center rounded-2xl bg-zinc-400/20" style={{ width, height: width }}>
          <YStack className="h-full w-full items-center justify-between gap-1 p-1">
            <Text className="w-full  text-start text-xl" numberOfLines={2} ellipsizeMode="middle">
              {file.name.split('.')[1].toLocaleUpperCase()}
            </Text>
            <Text className="text-foreground-secondary text-md">{formatFileSize(file.size)}</Text>
            <Text className="text-center text-xl" numberOfLines={1} ellipsizeMode="middle">
              {file.name.split('.')[0]}
            </Text>
          </YStack>
        </View>
      )}
    />
  )
}

export default FileItem
