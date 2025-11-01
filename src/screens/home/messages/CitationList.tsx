import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity, View } from 'react-native'

import { CitationSheet, Text, YStack } from '@/componentsV2'
import { FallbackFavicon } from '@/componentsV2/icons'
import type { Citation } from '@/types/websearch'

interface PreviewIconProps {
  citation: Citation
  index: number
  total: number
}

const PreviewIcon: React.FC<PreviewIconProps> = ({ citation, index, total }) => (
  <View
    className="flex h-[14px] w-[14px] items-center justify-center overflow-hidden rounded-full border border-transparent bg-transparent"
    style={[{ zIndex: total - index, marginLeft: index === 0 ? 0 : -2 }]}>
    <FallbackFavicon hostname={new URL(citation.url).hostname} alt={citation.title || ''} />
  </View>
)

interface CitationsListProps {
  citations: Citation[]
}

const CitationsList: React.FC<CitationsListProps> = ({ citations }) => {
  const { t } = useTranslation()
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  const previewItems = citations.slice(0, 3)
  const count = citations.length
  if (!count) return null

  const handlePress = () => {
    bottomSheetModalRef.current?.present()
  }

  return (
    <YStack className="my-[6px]">
      <TouchableOpacity
        className="h-7 flex-row items-center gap-2 self-start rounded-lg border border-green-20 bg-green-10 px-2 dark:border-green-dark-20 dark:bg-green-dark-10"
        onPress={handlePress}>
        <View className="flex-row items-center">
          {previewItems.map((c, i) => (
            <PreviewIcon key={i} citation={c} index={i} total={previewItems.length} />
          ))}
        </View>
        <Text className="text-[10px] text-green-100 dark:text-green-dark-100">{t('chat.citation', { count })}</Text>
      </TouchableOpacity>
      <CitationSheet ref={bottomSheetModalRef} citations={citations} />
    </YStack>
  )
}

export default CitationsList
