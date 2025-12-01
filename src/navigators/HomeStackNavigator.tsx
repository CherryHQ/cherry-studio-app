import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import AssistantDetailScreen from '@/screens/assistant/AssistantDetailScreen'
import ChatScreen from '@/screens/home/ChatScreen'
import HtmlPreviewScreen from '@/screens/home/HtmlPreviewScreen'
import SettingsScreen from '@/screens/settings/SettingsScreen'
import TopicScreen from '@/screens/topic/TopicScreen'
import type { AssistantDetailScreenParams } from '@/types/naviagate'

import AboutStackNavigator from './settings/AboutStackNavigator'
import AssistantSettingsStackNavigator from './settings/AssistantSettingsStackNavigator'
import DataSourcesStackNavigator from './settings/DataSourcesStackNavigator'
import GeneralSettingsStackNavigator from './settings/GeneralSettingsStackNavigator'
import ProvidersStackNavigator from './settings/ProvidersStackNavigator'
import WebSearchStackNavigator from './settings/WebSearchStackNavigator'

export type HomeStackParamList = {
  ChatScreen: { topicId: string }
  TopicScreen: { assistantId?: string } | undefined
  AssistantDetailScreen: AssistantDetailScreenParams
  SettingsScreen: undefined
  HtmlPreviewScreen: undefined
  GeneralSettings: { screen?: string; params?: any } | undefined
  AssistantSettings: { screen?: string; params?: any } | undefined
  ProvidersSettings: { screen?: string; params?: any } | undefined
  DataSourcesSettings: { screen?: string; params?: any } | undefined
  WebSearchSettings: { screen?: string; params?: any } | undefined
  AboutSettings: { screen?: string; params?: any } | undefined
}

const Stack = createStackNavigator<HomeStackParamList>()

export default function HomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="ChatScreen" component={ChatScreen} />
      <Stack.Screen name="TopicScreen" component={TopicScreen} />
      <Stack.Screen name="AssistantDetailScreen" component={AssistantDetailScreen} />
      <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
      <Stack.Screen name="HtmlPreviewScreen" component={HtmlPreviewScreen} />
      <Stack.Screen name="GeneralSettings" component={GeneralSettingsStackNavigator} />
      <Stack.Screen name="AssistantSettings" component={AssistantSettingsStackNavigator} />
      <Stack.Screen name="ProvidersSettings" component={ProvidersStackNavigator} />
      <Stack.Screen name="DataSourcesSettings" component={DataSourcesStackNavigator} />
      <Stack.Screen name="WebSearchSettings" component={WebSearchStackNavigator} />
      <Stack.Screen name="AboutSettings" component={AboutStackNavigator} />
    </Stack.Navigator>
  )
}
