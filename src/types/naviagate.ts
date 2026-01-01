import type { DrawerNavigationProp } from '@react-navigation/drawer'
import type { NavigatorScreenParams, RouteProp } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'

import type { AssistantMarketStackParamList } from '@/navigators/AssistantMarketStackNavigator'
import type { AssistantStackParamList } from '@/navigators/AssistantStackNavigator'
import type { HomeStackParamList } from '@/navigators/HomeStackNavigator'
import type { McpStackParamList } from '@/navigators/McpStackNavigator'
import type { AboutStackParamList } from '@/navigators/settings/AboutStackNavigator'
import type { DataSourcesStackParamList } from '@/navigators/settings/DataSourcesStackNavigator'
import type { GeneralSettingsStackParamList } from '@/navigators/settings/GeneralSettingsStackNavigator'
import type { ProvidersStackParamList } from '@/navigators/settings/ProvidersStackNavigator'
import type { WebSearchStackParamList } from '@/navigators/settings/WebSearchStackNavigator'
import type { SettingsStackParamList } from '@/navigators/SettingsStackNavigator'
import type { WelcomeStackParamList } from '@/navigators/WelcomeStackNavigator'

export type AssistantDetailScreenParams = {
  assistantId: string
  tab?: string
  returnTo?: 'chat'
  topicId?: string
}

// App Drawer Navigator
export type AppDrawerParamList = {
  Home:
    | { screen: 'ChatScreen'; params: { topicId: string } }
    | { screen: 'TopicScreen'; params?: { assistantId?: string } }
    | { screen: 'AssistantDetailScreen'; params: AssistantDetailScreenParams }
    | { screen: 'SettingsScreen' }
    | { screen: 'GeneralSettings'; params?: any }
    | { screen: 'AssistantSettings'; params?: any }
    | { screen: 'ProvidersSettings'; params?: any }
    | { screen: 'DataSourcesSettings'; params?: any }
    | { screen: 'WebSearchSettings'; params?: any }
    | { screen: 'AboutSettings'; params?: any }
    | undefined
  Assistant:
    | { screen: 'AssistantScreen' }
    | {
        screen: 'AssistantDetailScreen'
        params: AssistantDetailScreenParams
      }
    | undefined
  AssistantMarket: { screen: 'AssistantMarketScreen' } | undefined
  Mcp:
    | { screen: 'McpScreen' }
    | { screen: 'McpMarketScreen' }
    | { screen: 'McpDetailScreen'; params: { mcpId: string } }
}

// Root Stack Navigator (MainStackNavigator)
export type RootStackParamList = {
  Welcome: NavigatorScreenParams<WelcomeStackParamList> | undefined
  HomeScreen: NavigatorScreenParams<AppDrawerParamList> | undefined
}

// Navigation Props
export type RootNavigationProps = StackNavigationProp<RootStackParamList>
export type DrawerNavigationProps = DrawerNavigationProp<AppDrawerParamList>

// Nested Navigator Props
export type HomeNavigationProps = StackNavigationProp<HomeStackParamList>
export type AssistantNavigationProps = StackNavigationProp<AssistantStackParamList>
export type AssistantMarketNavigationProps = StackNavigationProp<AssistantMarketStackParamList>
export type McpNavigationProps = StackNavigationProp<McpStackParamList>
export type SettingsNavigationProps = StackNavigationProp<SettingsStackParamList>
export type WelcomeNavigationProps = StackNavigationProp<WelcomeStackParamList>

// Settings Sub-Navigator Props
export type GeneralSettingsNavigationProps = StackNavigationProp<GeneralSettingsStackParamList>
export type ProvidersNavigationProps = StackNavigationProp<ProvidersStackParamList>
export type DataSourcesNavigationProps = StackNavigationProp<DataSourcesStackParamList>
export type WebSearchNavigationProps = StackNavigationProp<WebSearchStackParamList>
export type AboutNavigationProps = StackNavigationProp<AboutStackParamList>

// Legacy compatibility
export type NavigationProps = RootNavigationProps

type LanTransferRouteParamList = {
  LanTransferScreen: { redirectToHome?: boolean } | undefined
}

export type LanTransferRouteProp = RouteProp<LanTransferRouteParamList, 'LanTransferScreen'>
