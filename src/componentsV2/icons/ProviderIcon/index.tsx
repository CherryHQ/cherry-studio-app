import { useFocusEffect } from '@react-navigation/native'
import { File, Paths } from 'expo-file-system'
import React, { useCallback, useState } from 'react'
import type { ImageRequireSource } from 'react-native'

import Image from '@/componentsV2/base/Image'
import { DEFAULT_ICONS_STORAGE } from '@/constants/storage'
import { useTheme } from '@/hooks/useTheme'
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

  const loadIcon = useCallback(() => {
    if (provider.isSystem) {
      setIconUri(getProviderIcon(provider.id, isDark))
    } else {
      // Try multiple image formats since users can upload jpg, jpeg, or png
      const possibleExtensions = ['png', 'jpg', 'jpeg']
      let foundUri = ''

      for (const ext of possibleExtensions) {
        const file = new File(Paths.join(DEFAULT_ICONS_STORAGE, `${provider.id}.${ext}`))
        if (file.exists) {
          // Add timestamp to bust cache when image file is updated
          foundUri = `${file.uri}?t=${Date.now()}`
          break
        }
      }

      setIconUri(foundUri)
    }
  }, [provider.id, provider.isSystem, isDark])

  // Reload icon when screen gains focus (e.g., returning from edit screen)
  useFocusEffect(
    useCallback(() => {
      loadIcon()
    }, [loadIcon])
  )

  const sizeClass = size ? `w-[${size}px] h-[${size}px]` : 'w-6 h-6'
  const finalClassName = className ? `${sizeClass} ${className}` : sizeClass

  if (!iconUri) {
    return null
  }

  return (
    <Image
      className={`${finalClassName} rounded-full`}
      source={typeof iconUri === 'string' ? { uri: iconUri } : iconUri}
      style={size ? { width: size, height: size } : undefined}
    />
  )
}
