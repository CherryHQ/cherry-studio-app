import React from 'react'
import { TouchableOpacity } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { ProviderIcon } from '@/componentsV2/icons'
import { Settings } from '@/componentsV2/icons/LucideIcon'
import XStack from '@/componentsV2/layout/XStack'
import type { Provider } from '@/types/assistant'

import type { ProviderSection } from './types'

interface ModelSectionHeaderProps {
  section: ProviderSection
  isFirstSection: boolean
  onSettingsPress: (provider: Provider) => void
}

export const ModelSectionHeader: React.FC<ModelSectionHeaderProps> = ({ section, isFirstSection, onSettingsPress }) => {
  return (
    <TouchableOpacity
      disabled
      activeOpacity={1}
      style={{
        marginTop: isFirstSection ? 0 : 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      className="px-2 py-1">
      <XStack className="items-center justify-start gap-3 px-0">
        <XStack className="items-center justify-center">
          <ProviderIcon provider={section.provider} size={24} />
        </XStack>
        <Text className="text-zinc-400/400 text-xl font-bold ">{section.title.toUpperCase()}</Text>
      </XStack>
      {section.provider.id !== 'cherryai' && (
        <TouchableOpacity onPress={() => onSettingsPress(section.provider)}>
          <Settings className="text-zinc-600/80" size={16} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}
