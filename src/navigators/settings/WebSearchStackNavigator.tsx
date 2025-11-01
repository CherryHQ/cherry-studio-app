import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import WebSearchProviderSettingsScreen from '@/screens/settings/websearch/WebSearchProviderSettingsScreen'
import WebSearchSettingsScreen from '@/screens/settings/websearch/WebSearchSettingsScreen'

export type WebSearchStackParamList = {
  WebSearchSettingsScreen: undefined
  WebSearchProviderSettingsScreen: { providerId: string }
}

const Stack = createNativeStackNavigator<WebSearchStackParamList>()

export default function WebSearchStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 },
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="WebSearchSettingsScreen" component={WebSearchSettingsScreen} />
      <Stack.Screen name="WebSearchProviderSettingsScreen" component={WebSearchProviderSettingsScreen} />
    </Stack.Navigator>
  )
}
