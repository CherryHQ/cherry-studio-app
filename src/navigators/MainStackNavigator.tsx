import '@/i18n'

import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React from 'react'

import AppDrawerNavigator from '@/navigators/AppDrawerNavigator'
import WelcomeStackNavigator from '@/navigators/WelcomeStackNavigator'
import { RootStackParamList } from '@/types/naviagate'
import { useAppState } from '@/hooks/useAppState'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function MainStackNavigator() {
  const { welcomeShown } = useAppState()

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
      {/* index */}
      {!welcomeShown && <Stack.Screen name="Welcome" component={WelcomeStackNavigator} />}
      <Stack.Screen name="HomeScreen" component={AppDrawerNavigator} />
    </Stack.Navigator>
  )
}
