import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import * as ExpoLinking from 'expo-linking'
import React, { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, TouchableOpacity } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { FallbackFavicon, X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import type { Citation } from '@/types/websearch'
import { getWebsiteBrand } from '@/utils/websearch'

const logger = loggerService.withContext('Citation Sheet')

export interface CitationSheetProps {
  citations: Citation[]
}

const CitationTitle = ({ number, title }: { number: number; title: string }) => (
  <XStack className="items-center gap-2.5">
    <YStack className="border-green-20 bg-green-10 h-5 w-5 items-center justify-center rounded-sm border px-1 py-0.5">
      <Text className="text-center text-[10px] text-green-100">{number}</Text>
    </YStack>
    <YStack className="flex-1">
      <Text className="text-text-primary text-base" numberOfLines={1} ellipsizeMode="tail">
        {title}
      </Text>
    </YStack>
  </XStack>
)

const Content = ({ content }: { content: string }) => (
  <XStack className="mt-1">
    <Text className="text-text-secondary text-sm leading-4" numberOfLines={3} ellipsizeMode="tail">
      {content}
    </Text>
  </XStack>
)

const Footer = ({ url, title }: { url: string; title: string }) => (
  <XStack className="mt-1.5 items-center gap-1.5">
    <FallbackFavicon hostname={new URL(url).hostname} alt={title || ''} />
    <Text className="text-text-secondary text-[10px] leading-5">{getWebsiteBrand(url)}</Text>
  </XStack>
)

const CitationCard = ({ citation, onPress }: { citation: Citation; onPress: (url: string) => void }) => (
  <YStack className="gap-2 py-2.5">
    <TouchableOpacity className="gap-2" activeOpacity={0.7} onPress={() => onPress(citation.url)}>
      <CitationTitle number={citation.number} title={citation.title || ''} />
      <Content content={citation.content || ''} />
      <Footer url={citation.url} title={citation.title || ''} />
    </TouchableOpacity>
  </YStack>
)

export const CitationSheet = forwardRef<BottomSheetModal, CitationSheetProps>(({ citations }, ref) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [ref, isVisible])

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

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

  const citationItems = citations ?? []

  return (
    <BottomSheetModal
      snapPoints={['40%', '90%']}
      enableDynamicSizing={false}
      ref={ref}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      backdropComponent={renderBackdrop}
      onDismiss={() => setIsVisible(false)}
      onChange={index => setIsVisible(index >= 0)}>
      <XStack className="items-center justify-between border-b border-black/10 px-4 pb-4">
        <Text className="text-text-primary text-base font-bold">{t('common.source')}</Text>
        <TouchableOpacity
          style={{
            padding: 4,
            backgroundColor: isDark ? '#333333' : '#dddddd',
            borderRadius: 16
          }}
          onPress={() => (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={16} />
        </TouchableOpacity>
      </XStack>
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <YStack className="px-5 pb-10 pt-2">
          {citationItems.map((citation, index) => (
            <YStack
              key={`${citation.url}-${index}`}
              className={`${index < citationItems.length - 1 ? 'border-b border-black/5' : ''}`}>
              <CitationCard citation={citation} onPress={handlePress} />
            </YStack>
          ))}
        </YStack>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

CitationSheet.displayName = 'CitationSheet'

export default CitationSheet
