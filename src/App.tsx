import 'react-native-reanimated'
import '@/i18n'

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { StatusBar } from 'expo-status-bar'
import { Suspense, useEffect } from 'react'
import React from 'react'
import { ActivityIndicator, useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Provider, useSelector } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { PortalProvider, TamaguiProvider } from 'tamagui'

import { getDataBackupProviders } from '@/config/backup'
import { getWebSearchProviders } from '@/config/websearchProviders'
import store, { persistor, RootState, useAppDispatch } from '@/store'
import { setInitialized } from '@/store/app'

import { DATABASE_NAME, db, expoDb } from '../db'
import { upsertAssistants } from '../db/queries/assistants.queries'
import { upsertDataBackupProviders } from '../db/queries/backup.queries'
import { upsertProviders, upsertWebSearchProviders } from '../db/queries/providers.queries'
import migrations from '../drizzle/migrations'
import tamaguiConfig from '../tamagui.config'
import { getSystemAssistants } from './config/assistants'
import { getSystemProviders } from './config/providers'
import AppNavigator from './navigators/AppNavigator'

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

// 数据库初始化组件
function DatabaseInitializer() {
  const { success, error } = useMigrations(db, migrations)
  const initialized = useSelector((state: RootState) => state.app.initialized)
  const dispatch = useAppDispatch()

  useDrizzleStudio(expoDb)

  useEffect(() => {
    const initializeApp = async () => {
      if (initialized) return

      try {
        console.log('First launch, initializing app data...')
        const assistants = getSystemAssistants()
        await upsertAssistants(assistants)
        const providers = getSystemProviders()
        await upsertProviders(providers)
        const websearchProviders = getWebSearchProviders()
        await upsertWebSearchProviders(websearchProviders)
        const dataBackupProviders = getDataBackupProviders()
        await upsertDataBackupProviders(dataBackupProviders)
        dispatch(setInitialized(true))
        console.log('App data initialized successfully.')
      } catch (e) {
        console.error('Failed to initialize app data', e)
      }
    }

    const handleMigrations = async () => {
      if (success) {
        console.log('Migrations completed successfully', expoDb.databasePath)
        await initializeApp()
      } else if (error) {
        console.error('Migrations failed', error)
      }
    }

    handleMigrations()
  }, [success, error, initialized, dispatch])

  useEffect(() => {
    SplashScreen.hideAsync()
  }, [])

  return null
}

// 主题和导航组件
function ThemedApp() {
  const colorScheme = useColorScheme()

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme ?? 'light'}>
      <PortalProvider>
        <NavigationContainer theme={DefaultTheme}>
          <ThemeProvider value={DefaultTheme}>
            <BottomSheetModalProvider>
              <DatabaseInitializer />
              <AppNavigator />
              <StatusBar style="auto" />
            </BottomSheetModalProvider>
          </ThemeProvider>
        </NavigationContainer>
      </PortalProvider>
    </TamaguiProvider>
  )
}

// Redux 状态管理组件
function AppWithRedux() {
  return (
    <Provider store={store}>
      <PersistGate loading={<ActivityIndicator size="large" />} persistor={persistor}>
        <ThemedApp />
      </PersistGate>
    </Provider>
  )
}

// 根组件 - 只负责最基础的 Provider 设置
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense fallback={<ActivityIndicator size="large" />}>
        <SQLiteProvider databaseName={DATABASE_NAME} options={{ enableChangeListener: true }} useSuspense>
          <AppWithRedux />
        </SQLiteProvider>
      </Suspense>
    </GestureHandlerRootView>
  )
}
