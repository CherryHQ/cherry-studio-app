import { X } from '@tamagui/lucide-icons'
import { FC } from 'react'
import React from 'react'
import { TouchableOpacity } from 'react-native'
import FileViewer from 'react-native-file-viewer'
import { Stack, Text, View, XStack, YStack } from 'tamagui'

import { FileIcon } from '@/components/icons/FileIcon'
import { FileType } from '@/types/file'
import { formatFileSize } from '@/utils/file'

interface FileItemProps {
  file: FileType
  onRemove?: (file: FileType) => void
  width?: number
  height?: number
}

const FileItem: FC<FileItemProps> = ({ file, onRemove }) => {
  const handlePreview = () => {
    FileViewer.open(file.path, { displayName: file.name }).catch(error => {
      console.error('打开文件时出错:', error)
    })
  }

  const handleRemove = e => {
    e.stopPropagation()
    onRemove?.(file)
  }

  return (
    <View>
      <TouchableOpacity onPress={handlePreview}>
        <View>
          <XStack
            gap={12}
            width="auto"
            // height={height}
            borderRadius={8}
            backgroundColor="rgba(0, 185, 107, 0.15)"
            justifyContent="center"
            alignItems="flex-start"
            paddingVertical={8}
            paddingHorizontal={12}>
            <Stack
              width={40}
              height={40}
              gap={10}
              borderRadius={99}
              backgroundColor="rgba(0, 185, 107, 1)"
              alignItems="center"
              justifyContent="center">
              <FileIcon size={24} />
            </Stack>
            <YStack justifyContent="center" gap={2}>
              <Text fontSize={16} lineHeight={20} numberOfLines={1} ellipsizeMode="middle">
                {file.name}
              </Text>
              <Text fontSize={12} lineHeight={16}>
                {formatFileSize(file.size)}
              </Text>
            </YStack>
            {onRemove && (
              <TouchableOpacity onPress={handleRemove}>
                <Stack
                  width={16}
                  height={16}
                  backgroundColor="rgba(255, 0, 0, 0.2)"
                  borderRadius={99}
                  alignItems="center"
                  justifyContent="center">
                  <X size={10} color="rgba(255, 0, 0, 1)" />
                </Stack>
              </TouchableOpacity>
            )}
          </XStack>
        </View>
      </TouchableOpacity>
    </View>
  )
}

export default FileItem
