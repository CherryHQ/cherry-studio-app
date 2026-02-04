import 'react-native-reanimated'
import '@/i18n'

import type { DrawerNavigationOptions } from '@react-navigation/drawer'
import { createDrawerNavigator } from '@react-navigation/drawer'
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native'
import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import CustomDrawerContent from '@/componentsV2/features/Menu/CustomDrawerContent'
import { TabletSidebar } from '@/componentsV2/layout/TabletSidebar'
import { usePreference } from '@/hooks/usePreference'
import { useResponsive } from '@/hooks/useResponsive'
import { Width } from '@/utils/device'

import AssistantMarketStackNavigator from './AssistantMarketStackNavigator'
import AssistantStackNavigator from './AssistantStackNavigator'
import HomeStackNavigator from './HomeStackNavigator'
import McpStackNavigator from './McpStackNavigator'

const Drawer = createDrawerNavigator()

const SETTINGS_ROUTES = new Set([
  'SettingsScreen',
  'GeneralSettings',
  'AssistantSettings',
  'ProvidersSettings',
  'DataSourcesSettings',
  'WebSearchSettings',
  'AboutSettings',
  'StreamableHttpTest'
])

const MCP_NESTED_ROUTES = new Set(['McpMarketScreen', 'McpDetailScreen'])

const screenOptions: DrawerNavigationOptions = {
  drawerStyle: {
    width: Width * 0.8
  },
  swipeEnabled: true,
  drawerType: 'slide',
  keyboardDismissMode: 'none'
}

const options: DrawerNavigationOptions = {
  headerShown: false
}

const getHomeScreenOptions = ({
  route
}: {
  route: RouteProp<Record<string, object | undefined>, string>
}): DrawerNavigationOptions => {
  const focusedRouteName =
    getFocusedRouteNameFromRoute(route) ?? (route.params as { screen?: string } | undefined)?.screen
  const swipeEnabled = !SETTINGS_ROUTES.has(focusedRouteName ?? '')

  return {
    ...options,
    swipeEnabled
  }
}

const getMcpScreenOptions = ({
  route
}: {
  route: RouteProp<Record<string, object | undefined>, string>
}): DrawerNavigationOptions => {
  const focusedRouteName =
    getFocusedRouteNameFromRoute(route) ?? (route.params as { screen?: string } | undefined)?.screen
  const swipeEnabled = !MCP_NESTED_ROUTES.has(focusedRouteName ?? '')

  return {
    ...options,
    swipeEnabled
  }
}



/**
 * 平板横屏双栏布局导航器
 * 使用 DrawerNavigator 但隐藏抽屉UI，通过固定侧边栏控制导航
 */
function TabletLandscapeNavigator() {
  const [sidebarPosition] = usePreference('ui.tablet_sidebar_position')
  const isRightSide = sidebarPosition === 'right'

  const drawerNavigator = useMemo(
    () => (
      <View style={[styles.container, isRightSide && styles.containerReversed]}>
        {/* 固定侧边栏 */}
        <View style={[styles.sidebarContainer, isRightSide ? styles.sidebarRight : styles.sidebarLeft]}>
          <TabletSidebar />
        </View>

        {/* 内容区域 - 使用 DrawerNavigator 但隐藏抽屉 */}
        <View style={styles.content}>
          <Drawer.Navigator
            drawerContent={props => <CustomDrawerContent {...props} />}
            screenOptions={{
              ...screenOptions,
              // 隐藏抽屉UI
              drawerType: 'permanent',
              drawerStyle: { width: 0, opacity: 0 },
              swipeEnabled: false
            }}>
            <Drawer.Screen name="Home" options={getHomeScreenOptions} component={HomeStackNavigator} />
            <Drawer.Screen name="Assistant" options={options} component={AssistantStackNavigator} />
            <Drawer.Screen name="AssistantMarket" options={options} component={AssistantMarketStackNavigator} />
            <Drawer.Screen name="Mcp" options={getMcpScreenOptions} component={McpStackNavigator} />
          </Drawer.Navigator>
        </View>
      </View>
    ),
    [isRightSide]
  )

  return drawerNavigator
}

/**
 * 移动端抽屉导航器
 */
function MobileDrawerNavigator() {
  const drawerNavigator = useMemo(
    () => (
      <Drawer.Navigator drawerContent={props => <CustomDrawerContent {...props} />} screenOptions={screenOptions}>
        <Drawer.Screen name="Home" options={getHomeScreenOptions} component={HomeStackNavigator} />
        <Drawer.Screen name="Assistant" options={options} component={AssistantStackNavigator} />
        <Drawer.Screen name="AssistantMarket" options={options} component={AssistantMarketStackNavigator} />
        <Drawer.Screen name="Mcp" options={getMcpScreenOptions} component={McpStackNavigator} />
      </Drawer.Navigator>
    ),
    []
  )

  return drawerNavigator
}

/**
 * 统一的导航器组件
 */
export default function AppDrawerNavigator() {
  const { isTablet, isLandscape } = useResponsive()
  const isTabletLandscape = isTablet && isLandscape

  // 平板横屏时：使用双栏布局
  if (isTabletLandscape) {
    return <TabletLandscapeNavigator />
  }

  // 移动端或平板竖屏：使用抽屉导航
  return <MobileDrawerNavigator />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row'
  },
  containerReversed: {
    flexDirection: 'row-reverse'
  },
  sidebarContainer: {
    width: 320,
    height: '100%'
  },
  sidebarLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(0,0,0,0.1)'
  },
  sidebarRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(0,0,0,0.1)'
  },
  content: {
    flex: 1,
    height: '100%'
  }
})
