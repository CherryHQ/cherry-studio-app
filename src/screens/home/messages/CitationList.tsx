import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { Text, YStack } from '@/componentsV2'
import { presentCitationSheet } from '@/componentsV2/features/Sheet/CitationSheet'
import { FallbackFavicon } from '@/componentsV2/icons'
import type { Citation } from '@/types/websearch'

interface PreviewIconProps {
  citation: Citation
  index: number
  total: number
}

const PreviewIcon: React.FC<PreviewIconProps> = ({ citation, index, total }) => (
  <View
    className="flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-full border border-transparent bg-transparent"
    style={[{ zIndex: total - index, marginLeft: index === 0 ? 0 : -2 }]}>
    <FallbackFavicon hostname={new URL(citation.url).hostname} alt={citation.title || ''} />
  </View>
)

interface CitationsListProps {
  citations: Citation[]
}

const CitationsList: React.FC<CitationsListProps> = ({ citations }) => {
  const { t } = useTranslation()

  const previewItems = citations.slice(0, 3)
  const count = citations.length
  if (!count) return null

  const handlePress = () => {
    presentCitationSheet(citations)
  }

  return (
    <YStack className="my-1.5">
      <Pressable
        className="secondary-container h-7 flex-row items-center gap-2 self-start rounded-lg border px-2"
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        onPress={handlePress}>
        <View className="flex-row items-center">
          {previewItems.map((c, i) => (
            <PreviewIcon key={i} citation={c} index={i} total={previewItems.length} />
          ))}
        </View>
        <Text className="primary-text text-[10px]">{t('chat.citation', { count })}</Text>
      </Pressable>
    </YStack>
  )
}

export default CitationsList
