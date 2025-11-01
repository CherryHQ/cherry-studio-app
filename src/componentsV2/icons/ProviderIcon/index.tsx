import { File, Paths } from 'expo-file-system'
import { useTheme } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import type { ImageRequireSource } from 'react-native'

import Image from '@/componentsV2/base/Image'
import YStack from '@/componentsV2/layout/YStack'
import { DEFAULT_ICONS_STORAGE } from '@/constants/storage'
import type { Provider } from '@/types/assistant'
import { getProviderIcon } from '@/utils/icons/'

interface ProviderIconProps {
  provider: Provider
  size?: number
  className?: string
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({ provider, size, className }) => {
  const { isDark } = useTheme()
  const [iconUri, setIconUri] = useState<ImageRequireSource | string | undefined>(undefined)

  useEffect(() => {
    const loadIcon = async () => {
      if (provider.isSystem) {
        setIconUri(getProviderIcon(provider.id, isDark))
      } else {
        const file = new File(Paths.join(DEFAULT_ICONS_STORAGE, `${provider.id}.png`))

        if (file.exists) {
          setIconUri(file.uri)
        } else {
          setIconUri('')
        }
      }
    }

    loadIcon()
  }, [provider.id, provider.isSystem, isDark])

  const sizeClass = size ? `w-[${size}px] h-[${size}px]` : 'w-6 h-6'
  const finalClassName = className ? `${sizeClass} ${className}` : sizeClass

  if (!iconUri) {
    return <YStack className={finalClassName} style={size ? { width: size, height: size } : undefined} />
  }

  return (
    <Image
      className={`${finalClassName} rounded-full`}
      source={typeof iconUri === 'string' ? { uri: iconUri } : iconUri}
      style={size ? { width: size, height: size } : undefined}
    />
  )
}
