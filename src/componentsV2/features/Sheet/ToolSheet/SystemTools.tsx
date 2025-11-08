import { Button } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import { Camera, FolderClosed, Image as ImageIcon } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'

interface SystemTool {
  key: string
  label: string
  icon: React.ReactNode
  onPress: () => void
}

interface SystemToolsProps {
  onCameraPress: () => void
  onImagePress: () => void
  onFilePress: () => void
}

export const SystemTools: React.FC<SystemToolsProps> = ({ onCameraPress, onImagePress, onFilePress }) => {
  const { t } = useTranslation()

  const options: SystemTool[] = [
    {
      key: 'camera',
      label: t('common.camera'),
      icon: <Camera size={24} className="text-text-primary" />,
      onPress: onCameraPress
    },
    {
      key: 'photo',
      label: t('common.photo'),
      icon: <ImageIcon size={24} className="text-text-primary" />,
      onPress: onImagePress
    },
    {
      key: 'file',
      label: t('common.file'),
      icon: <FolderClosed size={24} className="text-text-primary" />,
      onPress: onFilePress
    }
  ]

  return (
    <XStack className="justify-between gap-3 px-5">
      {options.map(option => (
        <Button
          key={option.key}
          className="bg-gray-20 aspect-[1.618] flex-1 flex-col items-center justify-center gap-2 rounded-lg"
          onPress={option.onPress}>
          {option.icon}
          <Button.Label>
            <Text className="text-text-primary text-center text-base">{option.label}</Text>
          </Button.Label>
        </Button>
      ))}
    </XStack>
  )
}
