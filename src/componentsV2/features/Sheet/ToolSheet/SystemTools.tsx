import { Button } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { Camera, FolderClosed, Image as ImageIcon } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'

import type { FileHandlerLoadingState, SystemToolConfig } from './types'

interface SystemToolsProps {
  onCameraPress: () => void
  onImagePress: () => void
  onFilePress: () => void
  loadingState?: FileHandlerLoadingState
}

export const SystemTools: React.FC<SystemToolsProps> = ({ onCameraPress, onImagePress, onFilePress, loadingState }) => {
  const { t } = useTranslation()

  const options: (SystemToolConfig & { loadingKey?: keyof FileHandlerLoadingState })[] = [
    {
      key: 'camera',
      label: t('common.camera'),
      icon: <Camera size={24} className="text-foreground" />,
      onPress: onCameraPress,
      loadingKey: 'isTakingPhoto'
    },
    {
      key: 'photo',
      label: t('common.photo'),
      icon: <ImageIcon size={24} className="text-foreground" />,
      onPress: onImagePress,
      loadingKey: 'isAddingImage'
    },
    {
      key: 'file',
      label: t('common.file'),
      icon: <FolderClosed size={24} className="text-foreground" />,
      onPress: onFilePress,
      loadingKey: 'isAddingFile'
    }
  ]

  return (
    <XStack className="justify-between gap-3 px-5">
      {options.map(option => {
        const isLoading = option.loadingKey && loadingState?.[option.loadingKey]
        const isAnyLoading = loadingState && Object.values(loadingState).some(Boolean)

        return (
          <Button
            pressableFeedbackVariant="ripple"
            key={option.key}
            className="aspect-[1.618] flex-1 flex-col items-center justify-center gap-2 rounded-lg bg-zinc-400/20"
            onPress={option.onPress}
            isDisabled={isAnyLoading}>
            {isLoading ? <ActivityIndicator size="small" /> : option.icon}
            <Button.Label>
              <Text className="text-foreground text-center text-base">{option.label}</Text>
            </Button.Label>
          </Button>
        )
      })}
    </XStack>
  )
}
