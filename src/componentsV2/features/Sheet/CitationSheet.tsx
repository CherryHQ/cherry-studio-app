import { LegendList } from '@legendapp/list'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import * as ExpoLinking from 'expo-linking'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { FallbackFavicon, X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import type { Citation } from '@/types/websearch'
import { isIOS26 } from '@/utils/device'
import { getWebsiteBrand } from '@/utils/websearch'

const logger = loggerService.withContext('Citation Sheet')

const SHEET_NAME = 'citation-sheet'

// Global state for citations
let currentCitations: Citation[] = []
let updateCitationsCallback: ((citations: Citation[]) => void) | null = null

export const presentCitationSheet = (citations: Citation[]) => {
  currentCitations = citations
  updateCitationsCallback?.(citations)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissCitationSheet = () => TrueSheet.dismiss(SHEET_NAME)

const CitationTitle = ({ number, title }: { number: number; title: string }) => (
  <XStack className="items-center gap-2.5">
    <YStack className="primary-container h-5 w-5 items-center justify-center rounded-sm border px-1 py-0.5">
      <Text className="primary-text text-center text-[10px]">{number}</Text>
    </YStack>
    <YStack className="flex-1">
      <Text className="text-foreground text-base" numberOfLines={1} ellipsizeMode="tail">
        {title}
      </Text>
    </YStack>
  </XStack>
)

const Content = ({ content }: { content: string }) => (
  <XStack className="mt-1">
    <Text className="text-foreground-secondary text-sm leading-4" numberOfLines={3} ellipsizeMode="tail">
      {content}
    </Text>
  </XStack>
)

const Footer = ({ url, title }: { url: string; title: string }) => (
  <XStack className="mt-1.5 items-center gap-1.5">
    <FallbackFavicon hostname={new URL(url).hostname} alt={title || ''} />
    <Text className="text-foreground-secondary text-[10px] leading-5">{getWebsiteBrand(url)}</Text>
  </XStack>
)

const CitationCard = ({ citation, onPress }: { citation: Citation; onPress: (url: string) => void }) => (
  <YStack className="gap-2 py-2.5">
    <Pressable
      className="gap-2"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={() => onPress(citation.url)}>
      <CitationTitle number={citation.number} title={citation.title || ''} />
      <Content content={citation.content || ''} />
      <Footer url={citation.url} title={citation.title || ''} />
    </Pressable>
  </YStack>
)

export const CitationSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const [citations, setCitations] = useState<Citation[]>(currentCitations)

  useEffect(() => {
    updateCitationsCallback = setCitations
    return () => {
      updateCitationsCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissCitationSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const handlePress = async (url: string) => {
    const supported = await ExpoLinking.canOpenURL(url)

    if (supported) {
      try {
        await ExpoLinking.openURL(url)
      } catch (error) {
        const message = t('errors.cannotOpenLink', {
          error: error instanceof Error ? error.message : String(error)
        })
        logger.error(message, error)
      }
    } else {
      const message = t('errors.deviceCannotHandleLink', { url })
      logger.warn(message)
    }
  }

  const header = (
    <XStack className="border-foreground/10 items-center justify-between border-b px-4 pb-4 pt-5">
      <Text className="text-foreground text-lg font-bold">{t('common.source')}</Text>
      <Pressable
        style={({ pressed }) => ({
          padding: 4,
          backgroundColor: isDark ? '#333333' : '#dddddd',
          borderRadius: 16,
          opacity: pressed ? 0.7 : 1
        })}
        onPress={dismissCitationSheet}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={16} />
      </Pressable>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={[0.4, 0.9]}
      cornerRadius={30}
      grabber
      dismissible
      dimmed
      scrollable
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}>
      <View className="flex-1">
        <LegendList
          data={citations}
          keyExtractor={(citation, index) => `${citation.url}-${index}`}
          renderItem={({ item: citation, index }) => (
            <YStack className={`${index < citations.length - 1 ? 'border-foreground/10 border-b' : ''}`}>
              <CitationCard citation={citation} onPress={handlePress} />
            </YStack>
          )}
          nestedScrollEnabled={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={100}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}
          recycleItems
        />
      </View>
    </TrueSheet>
  )
}

CitationSheet.displayName = 'CitationSheet'

export default CitationSheet
