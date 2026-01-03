import type { FC, ReactNode } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, useWindowDimensions, View } from 'react-native'

import ContextMenu from '@/componentsV2/base/ContextMenu'
import { Share, X } from '@/componentsV2/icons'
import { useToast } from '@/hooks/useToast'
import { shareFile } from '@/services/FileService'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'

const logger = loggerService.withContext('Base Item')

export interface ContextMenuItem {
  title: string
  iOSIcon: string
  androidIcon: ReactNode
  onSelect: () => void
}

export interface BaseItemProps {
  file: FileMetadata
  onRemove?: (file: FileMetadata) => void
  onPress?: () => void
  size?: number
  disabledContextMenu?: boolean
  renderContent: (props: { width: number; hasError: boolean }) => ReactNode
  hasError?: boolean
  renderErrorPlaceholder?: (width: number) => ReactNode
  extraMenuItems?: ContextMenuItem[]
}

const BaseItem: FC<BaseItemProps> = ({
  file,
  onRemove,
  onPress,
  size,
  disabledContextMenu,
  renderContent,
  hasError = false,
  renderErrorPlaceholder,
  extraMenuItems = []
}) => {
  const { width: screenWidth } = useWindowDimensions()
  const itemWidth = size ? size : (screenWidth - 24) * 0.3
  const { t } = useTranslation()
  const toast = useToast()

  const handleRemove = (e: any) => {
    e.stopPropagation()
    onRemove?.(file)
  }

  const handleShare = async () => {
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
      logger.error('Error in handleShare:', error)
    }
  }

  const defaultMenuItems: ContextMenuItem[] = [
    {
      title: t('button.share'),
      iOSIcon: 'square.and.arrow.up',
      androidIcon: <Share size={16} className="text-foreground" />,
      onSelect: handleShare
    }
  ]

  const menuItems = [...extraMenuItems, ...defaultMenuItems]

  return (
    <View style={{ position: 'relative' }}>
      <ContextMenu onPress={onPress} disableContextMenu={disabledContextMenu} list={menuItems} borderRadius={10}>
        {hasError && renderErrorPlaceholder
          ? renderErrorPlaceholder(itemWidth)
          : renderContent({ width: itemWidth, hasError })}
      </ContextMenu>
      {onRemove && (
        <Pressable
          onPress={handleRemove}
          hitSlop={5}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          className="absolute right-1 top-1 rounded-full">
          <View className="rounded-full bg-zinc-700 p-0.5">
            <X size={14} className="white" />
          </View>
        </Pressable>
      )}
    </View>
  )
}

export default BaseItem
