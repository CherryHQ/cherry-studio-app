import '../styles/global.css';
import '@/polyfills/abortSignal';
import '@/polyfills/blob';

import { BottomSheetProvider } from '@swmansion/react-native-bottom-sheet';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeColor } from 'heroui-native/hooks';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { NavigationThemeProvider } from '@/components/navigation';
import { QueryProvider } from '@/data';
import { DataProvider, InitialDataGate } from '@/runtime';
import { bootstrapAppRuntime } from '@/runtime/appRuntime';
import { isIOS, isLiquidGlassAvailable } from '@/utils/constants';

// Hold the native splash across data-runtime init so the gate never exposes a
// blank frame. `DataProvider` calls `SplashScreen.hideAsync()` once init settles.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const RootGestureView = withUniwind(GestureHandlerRootView);

export default function RootLayout() {
  return (
    <RootGestureView className="flex-1">
      <KeyboardProvider>
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          <QueryProvider>
            <DataProvider bootstrap={bootstrapAppRuntime}>
              <InitialDataGate>
                <NavigationThemeProvider>
                  <BottomSheetProvider>
                    <RootStack />
                  </BottomSheetProvider>
                </NavigationThemeProvider>
              </InitialDataGate>
            </DataProvider>
          </QueryProvider>
        </HeroUINativeProvider>
      </KeyboardProvider>
    </RootGestureView>
  );
}

function RootStack() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: isIOS ? undefined : false,
        headerStyle: isIOS ? undefined : { backgroundColor },
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="topics"
        options={{
          contentStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: isIOS ? undefined : { backgroundColor: 'transparent' },
          headerTransparent: isLiquidGlassAvailable,
        }}
      />
      <Stack.Screen
        name="paintings/index"
        options={{
          contentStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: isIOS ? undefined : { backgroundColor: 'transparent' },
          headerTransparent: isLiquidGlassAvailable,
        }}
      />
      <Stack.Screen
        name="paintings/[paintingId]"
        options={{
          contentStyle: { backgroundColor: '#000000' },
          headerTintColor: '#ffffff',
          headerTransparent: true,
          title: '',
        }}
      />
      <Stack.Screen
        name="paintings/[paintingId]/conversation"
        options={{
          contentStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: isIOS ? undefined : { backgroundColor: 'transparent' },
          headerTransparent: isLiquidGlassAvailable,
        }}
      />
    </Stack>
  );
}
