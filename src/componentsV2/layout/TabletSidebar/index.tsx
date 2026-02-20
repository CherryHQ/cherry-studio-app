import { useNavigationState } from '@react-navigation/native'
import { Divider } from 'heroui-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { IconButton } from '@/componentsV2/base/IconButton'
import Image from '@/componentsV2/base/Image'
import Text from '@/componentsV2/base/Text'
import { Settings } from '@/componentsV2/icons'
import PressableRow from '@/componentsV2/layout/PressableRow'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { usePreference } from '@/hooks/usePreference'
import { useSafeArea } from '@/hooks/useSafeArea'
import { useSettings } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'
import { navigationRef } from '@/navigators/navigationRef'

import { DefaultSidebar } from './DefaultSidebar'
import { SettingsSidebar } from './SettingsSidebar'

const SIDEBAR_WIDTH = 280

// 设置路由集合（包含所有设置相关的路由和子路由）
export const SETTINGS_ROUTES = new Set([
  // 主设置路由
  'SettingsScreen',
  'GeneralSettings',
  'AssistantSettings',
  'ProvidersSettings',
  'DataSourcesSettings',
  'WebSearchSettings',
  'AboutSettings',
  'StreamableHttpTest',
  // ProvidersSettings 子路由
  'ProviderListScreen',
  'ProviderSettingsScreen',
  'ManageModelsScreen',
  'ApiServiceScreen',
  'AddProviderScreen',
  // AboutSettings 子路由
  'PersonalScreen',
  'AboutScreen',
  // AssistantSettings 子路由
  'AssistantSettingsScreen',
  // DataSourcesSettings 子路由
  'DataSettingsScreen',
  'BasicDataSettingsScreen',
  'LanTransferScreen',
  // GeneralSettings 子路由
  'GeneralSettingsScreen',
  // WebSearchSettings 子路由
  'WebSearchSettingsScreen',
  'WebSearchProviderSettingsScreen'
])

// 获取当前路由名称的工具函数
export function getCurrentRoute(state: any): string | undefined {
  let route = state.routes[state.index] as any
  while (route.state?.routes) {
    route = route.state.routes[route.state.index ?? 0] as any
  }
  return route?.name as string | undefined
}

export function TabletSidebar() {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const { avatar, userName } = useSettings()
  const insets = useSafeArea()
  const [sidebarPosition] = usePreference('ui.tablet_sidebar_position')
  const isRightSide = sidebarPosition === 'right'

  const currentRoute = useNavigationState(getCurrentRoute)
  const isInSettings = SETTINGS_ROUTES.has(currentRoute ?? '')
  const hasNavigatedToProvider = React.useRef(false)

  React.useEffect(() => {
    if (currentRoute === 'SettingsScreen' && !hasNavigatedToProvider.current) {
      hasNavigatedToProvider.current = true
      navigationRef.current?.navigate('Home', {
        screen: 'ProvidersSettings',
        params: { screen: 'ProviderListScreen' }
      })
    }
  }, [currentRoute])

  const handleNavigateSettingsScreen = () => {
    navigationRef.current?.navigate('Home', {
      screen: 'ProvidersSettings',
      params: { screen: 'ProviderListScreen' }
    })
  }

  const handleNavigatePersonalScreen = () => {
    navigationRef.current?.navigate('Home', { screen: 'AboutSettings', params: { screen: 'PersonalScreen' } })
  }

  const sidebarStyle = [
    styles.sidebar,
    isRightSide ? styles.sidebarRight : styles.sidebarLeft,
    {
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      backgroundColor: isDark ? '#121213' : '#f7f7f7'
    }
  ]

  // 如果当前在设置路由中，渲染设置侧边栏
  if (isInSettings) {
    return (
      <View style={sidebarStyle}>
        <SettingsSidebar />
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
          <IconButton
            icon={<Settings size={24} />}
            onPress={handleNavigateSettingsScreen}
            style={{ paddingRight: 16 }}
          />
        </XStack>
      </View>
    )
  }

  return (
    <View style={sidebarStyle}>
      <DefaultSidebar onNavigateSettings={handleNavigateSettingsScreen} />
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
