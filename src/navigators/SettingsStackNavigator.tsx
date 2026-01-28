import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import SettingsScreen from '@/screens/settings/SettingsScreen'

import AboutStackNavigator from './settings/AboutStackNavigator'
import AssistantSettingsStackNavigator from './settings/AssistantSettingsStackNavigator'
import DataSourcesStackNavigator from './settings/DataSourcesStackNavigator'
import GeneralSettingsStackNavigator from './settings/GeneralSettingsStackNavigator'
import ProvidersStackNavigator from './settings/ProvidersStackNavigator'
import SpeechToTextSettingsStackNavigator from './settings/SpeechToTextSettingsStackNavigator'
import WebSearchStackNavigator from './settings/WebSearchStackNavigator'

export type SettingsStackParamList = {
  SettingsScreen: undefined
  GeneralSettings: undefined
  AssistantSettings: undefined
  ProvidersSettings: undefined
  DataSourcesSettings: undefined
  WebSearchSettings: undefined
  AboutSettings: undefined
  SpeechToTextSettings: undefined
}

const Stack = createStackNavigator<SettingsStackParamList>()

export default function SettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
      <Stack.Screen name="GeneralSettings" component={GeneralSettingsStackNavigator} />
      <Stack.Screen name="AssistantSettings" component={AssistantSettingsStackNavigator} />
      <Stack.Screen name="ProvidersSettings" component={ProvidersStackNavigator} />
      <Stack.Screen name="DataSourcesSettings" component={DataSourcesStackNavigator} />
      <Stack.Screen name="WebSearchSettings" component={WebSearchStackNavigator} />
      <Stack.Screen name="AboutSettings" component={AboutStackNavigator} />
      <Stack.Screen name="SpeechToTextSettings" component={SpeechToTextSettingsStackNavigator} />
    </Stack.Navigator>
  )
}
