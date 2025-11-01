import { useTheme } from 'heroui-native'
import React from 'react'

import Image from '@/componentsV2/base/Image'
import type { WebSearchProvider } from '@/types/websearch'
import { getWebSearchProviderIcon } from '@/utils/icons/websearch'

interface WebsearchProviderIconProps {
  provider: WebSearchProvider
}

export const WebsearchProviderIcon: React.FC<WebsearchProviderIconProps> = ({ provider }) => {
  const { isDark } = useTheme()

  const iconSource = getWebSearchProviderIcon(provider.id, isDark)

  return <Image className="h-5 w-5" source={iconSource} />
}
