import { useTheme } from 'heroui-native'
import React from 'react'

import Image from '@/componentsV2/base/Image'
import type { Model } from '@/types/assistant'
import { getModelOrProviderIcon } from '@/utils/icons'

interface ModelIconProps {
  model: Model
  size?: number
  className?: string
}

export const ModelIcon: React.FC<ModelIconProps> = ({ model, size, className }) => {
  const { isDark } = useTheme()

  const iconSource = getModelOrProviderIcon(model.id, model.provider, isDark)

  const sizeClass = size ? `w-[${size}px] h-[${size}px]` : 'w-5 h-5'
  const finalClassName = className ? `${sizeClass} ${className}` : sizeClass

  return (
    <Image className={finalClassName} source={iconSource} style={size ? { width: size, height: size } : undefined} />
  )
}
