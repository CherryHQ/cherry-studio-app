import 'react-native-reanimated'
import '@/i18n'

import type { DrawerNavigationOptions } from '@react-navigation/drawer'
import { createDrawerNavigator } from '@react-navigation/drawer'
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native'
import React from 'react'

import CustomDrawerContent from '@/componentsV2/features/Menu/CustomDrawerContent'
import AssistantMarketStackNavigator from '@/navigators/AssistantMarketStackNavigator'
import AssistantStackNavigator from '@/navigators/AssistantStackNavigator'
import HomeStackNavigator from '@/navigators/HomeStackNavigator'
import { Width } from '@/utils/device'

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

export default function AppDrawerNavigator() {
  return (
    <Drawer.Navigator drawerContent={props => <CustomDrawerContent {...props} />} screenOptions={screenOptions}>
      {/* Main grouped navigators */}
      <Drawer.Screen name="Home" options={getHomeScreenOptions} component={HomeStackNavigator} />
      <Drawer.Screen name="Assistant" options={options} component={AssistantStackNavigator} />
      <Drawer.Screen name="AssistantMarket" options={options} component={AssistantMarketStackNavigator} />
      <Drawer.Screen name="Mcp" options={getMcpScreenOptions} component={McpStackNavigator} />

      {/* Individual screens for backward compatibility */}
      {/*<Drawer.Screen name="ChatScreen" options={options} component={ChatScreen} />
      <Drawer.Screen name="TopicScreen" options={options} component={TopicScreen} />*/}
    </Drawer.Navigator>
  )
}
