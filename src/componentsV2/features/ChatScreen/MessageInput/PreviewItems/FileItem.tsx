import { viewDocument } from '@react-native-documents/viewer'
import type { FC } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity, View } from 'react-native'

import ContextMenu from '@/componentsV2/base/ContextMenu'
import Text from '@/componentsV2/base/Text'
import { FileIcon, Share, X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useToast } from '@/hooks/useToast'
import { shareFile } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { formatFileSize } from '@/utils/file'

const logger = loggerService.withContext('File Item')

interface FileItemProps {
  file: FileMetadata
  onRemove?: (file: FileMetadata) => void
  width?: number
  height?: number
  disabledContextMenu?: boolean
}

const FileItem: FC<FileItemProps> = ({ file, onRemove, disabledContextMenu }) => {
  const { t } = useTranslation()
  const toast = useToast()

  const handlePreview = () => {
    viewDocument({ uri: file.path, mimeType: file.type }).catch(error => {
      logger.error('Handle Preview Error', error)
    })
  }

  const handleRemove = (e: any) => {
    e.stopPropagation()
    onRemove?.(file)
  }

  const handleShareFile = async () => {
    try {
      const result = await shareFile(file.path)

      if (result.success) {
        logger.info('File shared successfully')
      } else {
        toast.show(result.message, { color: 'red', duration: 2500 })
        logger.warn('Failed to share file:', result.message)
      }
    } catch (error) {
      toast.show(t('common.error_occurred'), { color: 'red', duration: 2500 })
      logger.error('Error in handleShareFile:', error)
    }
  }

  return (
    <ContextMenu
      onPress={handlePreview}
      disableContextMenu={disabledContextMenu}
      list={[
        {
          title: t('button.share'),
          iOSIcon: 'square.and.arrow.up',
          androidIcon: <Share size={16} className="text-text-primary dark:text-text-primary-dark" />,
          onSelect: handleShareFile
        }
      ]}
      borderRadius={16}>
      <XStack className="items-center justify-start gap-1.5 rounded-lg bg-green-20 px-1.5 py-1.5 pr-3 dark:bg-green-dark-20">
        <View className="h-9 w-9 items-center justify-center gap-2 rounded-[9.5px] bg-green-100 dark:bg-green-dark-100">
          <FileIcon size={20} className="text-white dark:text-black" />
        </View>
        <YStack className="gap-0.75 justify-center">
          <Text
            className="leading-3.5 text-sm text-text-primary dark:text-text-primary-dark"
            numberOfLines={1}
            ellipsizeMode="middle">
            {file.name}
          </Text>
          <Text className="leading-2.75 text-xs text-text-secondary dark:text-text-secondary-dark">
            {formatFileSize(file.size)}
          </Text>
        </YStack>
      </XStack>
      {onRemove && (
        <TouchableOpacity onPress={handleRemove} hitSlop={5} className="absolute -right-1.5 -top-1.5 rounded-full">
          <View className="rounded-full border border-white p-0.5">
            <X size={14} />
          </View>
        </TouchableOpacity>
      )}
    </ContextMenu>
  )
}

export default FileItem
