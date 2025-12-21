import { createStackNavigator, TransitionPresets } from '@react-navigation/stack'
import React from 'react'

import BasicDataSettingsScreen from '@/screens/settings/data/BasicDataSettingsScreen'
import DataSettingsScreen from '@/screens/settings/data/DataSettingsScreen'
import LanTransferScreen from '@/screens/settings/data/LanTransfer/LanTransferScreen'

export type DataSourcesStackParamList = {
  DataSettingsScreen: undefined
  BasicDataSettingsScreen: undefined
  LanTransferScreen: { redirectToHome?: boolean } | undefined
}

const Stack = createStackNavigator<DataSourcesStackParamList>()

export default function DataSourcesStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureResponseDistance: 9999,
        ...TransitionPresets.SlideFromRightIOS
      }}>
      <Stack.Screen name="DataSettingsScreen" component={DataSettingsScreen} />
      <Stack.Screen name="BasicDataSettingsScreen" component={BasicDataSettingsScreen} />
      <Stack.Screen name="LanTransferScreen" component={LanTransferScreen} />
    </Stack.Navigator>
  )
}
