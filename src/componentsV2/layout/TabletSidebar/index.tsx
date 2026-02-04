import { Divider } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import Image from '@/componentsV2/base/Image'
import Text from '@/componentsV2/base/Text'
import { AssistantList } from '@/componentsV2/features/Menu/AssistantList'
import { MenuTabContent } from '@/componentsV2/features/Menu/MenuTabContent'
import { MarketIcon, MCPIcon, Settings } from '@/componentsV2/icons'
import PressableRow from '@/componentsV2/layout/PressableRow'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { useAssistants } from '@/hooks/useAssistant'
import { usePreference } from '@/hooks/usePreference'
import { useSafeArea } from '@/hooks/useSafeArea'
import { useSettings } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { useCurrentTopic } from '@/hooks/useTopic'
import { navigationRef } from '@/navigators/navigationRef'
import { loggerService } from '@/services/LoggerService'
import { topicService } from '@/services/TopicService'
import type { Assistant } from '@/types/assistant'

const logger = loggerService.withContext('TabletSidebar')

const SIDEBAR_WIDTH = 320

export function TabletSidebar() {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const { avatar, userName } = useSettings()
  const insets = useSafeArea()
  const { switchTopic } = useCurrentTopic()
  const [sidebarPosition] = usePreference('ui.tablet_sidebar_position')
  const isRightSide = sidebarPosition === 'right'

  const { assistants, isLoading: isAssistantsLoading } = useAssistants()

  const handleNavigateAssistantScreen = () => {
    navigationRef.current?.navigate('Assistant', { screen: 'AssistantScreen' })
  }

  const handleNavigateAssistantMarketScreen = () => {
    navigationRef.current?.navigate('AssistantMarket', { screen: 'AssistantMarketScreen' })
  }

  const handleNavigateMcpScreen = () => {
    navigationRef.current?.navigate('Mcp', { screen: 'McpScreen' })
  }

  const handleNavigateSettingsScreen = () => {
    navigationRef.current?.navigate('Home', { screen: 'SettingsScreen' })
  }

  const handleNavigatePersonalScreen = () => {
    navigationRef.current?.navigate('Home', { screen: 'AboutSettings', params: { screen: 'PersonalScreen' } })
  }

  const handleNavigateChatScreen = (topicId: string) => {
    navigationRef.current?.navigate('Home', { screen: 'ChatScreen', params: { topicId: topicId } })
  }

  const handleAssistantItemPress = async (assistant: Assistant) => {
    try {
      const assistantTopics = await topicService.getTopicsByAssistantId(assistant.id)
      const latestTopic = assistantTopics[0]

      if (latestTopic) {
        await switchTopic(latestTopic.id)
        handleNavigateChatScreen(latestTopic.id)
        return
      }

      const newTopic = await topicService.createTopic(assistant)
      await switchTopic(newTopic.id)
      handleNavigateChatScreen(newTopic.id)
    } catch (error) {
      logger.error('Failed to open assistant topic from sidebar', error as Error)
    }
  }

  return (
    <View
      style={[
        styles.sidebar,
        isRightSide ? styles.sidebarRight : styles.sidebarLeft,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: isDark ? '#121213' : '#f7f7f7'
        }
      ]}>
      <YStack className="flex-1 gap-2.5">
        <YStack className="gap-1.5 px-2.5">
          <PressableRow
            className="flex-row items-center justify-between rounded-lg px-2.5 py-2.5"
            onPress={handleNavigateAssistantMarketScreen}>
            <XStack className="items-center justify-center gap-2.5">
              <MarketIcon size={24} />
              <Text className="text-base">{t('assistants.market.title')}</Text>
            </XStack>
            <RowRightArrow />
          </PressableRow>

          <PressableRow
            className="flex-row items-center justify-between rounded-lg px-2.5 py-2.5"
            onPress={handleNavigateMcpScreen}>
            <XStack className="items-center justify-center gap-2.5">
              <MCPIcon size={24} />
              <Text className="text-base">{t('mcp.server.title')}</Text>
            </XStack>
            <RowRightArrow />
          </PressableRow>
          <YStack className="px-2.5">
            <Divider />
          </YStack>
        </YStack>

        <MenuTabContent title={t('assistants.title.mine')} onSeeAllPress={handleNavigateAssistantScreen}>
          <AssistantList
            assistants={assistants}
            isLoading={isAssistantsLoading}
            onAssistantPress={handleAssistantItemPress}
          />
        </MenuTabContent>
      </YStack>

      <YStack className="px-5 pb-2.5">
        <Divider />
      </YStack>

      <XStack className="items-center justify-between">
        <PressableRow className="items-center gap-2.5" onPress={handleNavigatePersonalScreen}>
          <Image
            className="h-12 w-12 rounded-full"
            source={avatar ? { uri: avatar } : require('@/assets/images/favicon.png')}
          />
          <Text className="text-base">{userName || t('common.cherry_studio')}</Text>
        </PressableRow>
        <IconButton icon={<Settings size={24} />} onPress={handleNavigateSettingsScreen} style={{ paddingRight: 16 }} />
      </XStack>
    </View>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%'
  },
  sidebarLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(0,0,0,0.1)'
  },
  sidebarRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(0,0,0,0.1)'
  }
})
