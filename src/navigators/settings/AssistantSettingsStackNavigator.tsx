import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AssistantDetailScreen from '@/screens/assistant/AssistantDetailScreen'
import AssistantSettingsScreen from '@/screens/settings/assistant/AssistantSettingsScreen'

export type AssistantSettingsStackParamList = {
  AssistantSettingsScreen: undefined
  AssistantDetailScreen: { assistantId: string; tab?: string }
}

const Stack = createNativeStackNavigator<AssistantSettingsStackParamList>()

export default function AssistantSettingsStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: { start: 9999 },
        animation: 'slide_from_right'
      }}>
      <Stack.Screen name="AssistantSettingsScreen" component={AssistantSettingsScreen} />
      <Stack.Screen name="AssistantDetailScreen" component={AssistantDetailScreen} />
    </Stack.Navigator>
  )
}
