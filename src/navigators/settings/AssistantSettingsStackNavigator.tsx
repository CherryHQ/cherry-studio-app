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
        animation: 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}>
      <Stack.Screen name="AssistantSettingsScreen" component={AssistantSettingsScreen} />
      <Stack.Screen
        name="AssistantDetailScreen"
        component={AssistantDetailScreen}
        options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
    </Stack.Navigator>
  )
}
