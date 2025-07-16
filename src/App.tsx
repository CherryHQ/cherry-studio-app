import 'react-native-reanimated'
import '@/i18n'

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { DefaultTheme, NavigationContainer, ThemeProvider } from '@react-navigation/native'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin'
import { Image } from 'expo-image' // [1. 新增] 导入 Image
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { StatusBar } from 'expo-status-bar'
import React, { Suspense, useEffect } from 'react'
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
import { upsertProviders } from '../db/queries/providers.queries'
import { upsertWebSearchProviders } from '../db/queries/websearchProviders.queries'
import migrations from '../drizzle/migrations'
import tamaguiConfig from '../tamagui.config'
import { getSystemAssistants } from './config/assistants'
import { getSystemProviders } from './config/providers'
import AppNavigator from './navigators/AppNavigator'

// 创建一个辅助函数来加载指定上下文中的所有模块
function preloadImagesFromContext(context: any): string[] {
  // context.keys() 会返回一个包含所有匹配文件相对路径的数组
  // .map(context) 会对每个路径执行 require() 操作，返回图片资源的路径
  return context.keys().map((path: string) => context(path) as string);
}

// 使用 require.context 动态地构建预加载列表
const imagesToPreload = [
  // 遍历 llmIcons/dark 文件夹下所有图片
  ...preloadImagesFromContext(require.context('@/assets/images/llmIcons/dark', false, /\.(png|jpe?g|gif)$/)),

  // 遍历 llmIcons/light 文件夹下所有图片
  ...preloadImagesFromContext(require.context('@/assets/images/llmIcons/light', false, /\.(png|jpe?g|gif)$/)),

  // 遍历 websearchIcons 文件夹下所有图片
  ...preloadImagesFromContext(require.context('@/assets/images/websearchIcons', false, /\.(png|jpe?g|gif)$/)),

  // 遍历 dataIcons 文件夹下所有图片
  ...preloadImagesFromContext(require.context('@/assets/images/dataIcons', false, /\.(png|jpe?g|gif)$/)),
];


// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

// 数据库和资源初始化组件
function DatabaseInitializer() {
  const { success, error } = useMigrations(db, migrations)
  const initialized = useSelector((state: RootState) => state.app.initialized)
  const dispatch = useAppDispatch()

  useDrizzleStudio(expoDb)

  useEffect(() => {
    const initializeApp = async () => {
      // 如果已经初始化过，就直接隐藏启动屏并返回
      if (initialized) {
        SplashScreen.hideAsync()
        return
      }

      try {
        console.log('First launch, initializing app data and preloading images...')

        // [3. 修改] 将图片预加载和数据库初始化任务并行处理
        const preloadImageTasks = imagesToPreload.map(img => Image.prefetch(img))

        await Promise.all([
          ...preloadImageTasks, // 图片任务
          (async () => { // 原有的数据库任务
            const assistants = getSystemAssistants()
            await upsertAssistants(assistants)
            const providers = getSystemProviders()
            await upsertProviders(providers)
            const websearchProviders = getWebSearchProviders()
            await upsertWebSearchProviders(websearchProviders)
            const dataBackupProviders = getDataBackupProviders()
            await upsertDataBackupProviders(dataBackupProviders)
          })(),
        ])

        dispatch(setInitialized(true))
        console.log('App data and images initialized successfully.')
      } catch (e) {
        console.error('Failed to initialize app data or preload images', e)
      } finally {
        // [4. 修改] 确保无论成功与否，启动屏最终都会被隐藏
        SplashScreen.hideAsync()
      }
    }

    const handleMigrations = async () => {
      if (success) {
        console.log('Migrations completed successfully.')
        await initializeApp()
      } else if (error) {
        console.error('Migrations failed', error)
        // 即使迁移失败，也应隐藏启动屏，避免卡死
        SplashScreen.hideAsync()
      }
    }

    handleMigrations()
  }, [success, error, initialized, dispatch])

  // [5. 删除] 移除这个独立的 useEffect，因为它会过早隐藏启动屏
  // useEffect(() => {
  //   SplashScreen.hideAsync()
  // }, [])

  return null // 这个组件只负责逻辑，不渲染任何东西
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

// 根组件
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