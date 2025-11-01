import '@/i18n'
import 'react-native-reanimated'
import '../global.css'

import { DATABASE_NAME, db, expoDb } from '@db'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { HeroUINativeProvider, useTheme as useHerouiTheme } from 'heroui-native'
import React, { Suspense, useEffect } from 'react'
import { ActivityIndicator } from 'react-native'
import { SystemBars } from 'react-native-edge-to-edge'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { useTheme } from '@/hooks/useTheme'
import { loggerService } from '@/services/LoggerService'
import store, { persistor } from '@/store'

import migrations from '../drizzle/migrations'
import { DialogProvider } from './hooks/useDialog'
import { ToastProvider } from './hooks/useToast'
import MainStackNavigator from './navigators/MainStackNavigator'
import { runAppDataMigrations } from './services/AppInitializationService'

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()
const initializationLogger = loggerService.withContext('AppInitialization')

// 数据库初始化组件
function DatabaseInitializer({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations)
  const [loaded] = useFonts({
    JetbrainMono: require('./assets/fonts/JetBrainsMono-Regular.ttf')
  })

  useDrizzleStudio(expoDb)

  useEffect(() => {
    if (success) {
      initializationLogger.info('Database migrations completed successfully', expoDb.databasePath)
    }

    if (error) {
      initializationLogger.error('Database migrations failed', error as Error)
    }
  }, [success, error])

  useEffect(() => {
    if (success && loaded) {
      const initializeApp = async () => {
        try {
          await runAppDataMigrations()
        } catch (e) {
          initializationLogger.error('Failed to initialize app data', e as Error)
        }
      }

      initializeApp()
    }
  }, [success, loaded])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  // 如果迁移失败，显示错误界面
  if (error) {
    return <ActivityIndicator size="large" color="red" />
  }

  // 如果迁移还未完成或字体未加载，显示加载指示器
  if (!success || !loaded) {
    return <ActivityIndicator size="large" />
  }

  // 迁移成功且字体已加载，渲染子组件
  return <>{children}</>
}

// 主题和导航组件
function ThemedApp() {
  const { themeSetting } = useTheme()
  const { isDark } = useHerouiTheme()

  return (
    <HeroUINativeProvider config={{ colorScheme: themeSetting }}>
      <KeyboardProvider>
        <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme}>
          <SystemBars style={isDark ? 'dark' : 'light'} />
          <DialogProvider>
            <ToastProvider>
              <BottomSheetModalProvider>
                <MainStackNavigator />
              </BottomSheetModalProvider>
            </ToastProvider>
          </DialogProvider>
        </NavigationContainer>
      </KeyboardProvider>
    </HeroUINativeProvider>
  )
}

// Redux 状态管理组件
function AppWithRedux() {
  return (
    <Provider store={store}>
      <PersistGate loading={<ActivityIndicator size="large" />} persistor={persistor}>
        <DatabaseInitializer>
          <ThemedApp />
        </DatabaseInitializer>
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
