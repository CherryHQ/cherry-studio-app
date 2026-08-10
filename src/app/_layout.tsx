import '../frontend/styles/global.css';
import '@/bootstrap/preboot/abortSignal';
import '@/bootstrap/preboot/blob';
import '@/bootstrap/preboot/webCrypto';
import { BottomSheetProvider } from '@swmansion/react-native-bottom-sheet';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { AppBootstrapGate, AppBootstrapProvider } from '@/bootstrap';
import { AlertProvider } from '@/frontend/components/AlertProvider';
import { NavigationThemeProvider } from '@/frontend/components/navigation';
import { QueryProvider } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isIOS, isLiquidGlassAvailable } from '@/frontend/utils/constants';

// Hold the native splash across app bootstrap so the gate never exposes a
// blank frame. `AppBootstrapProvider` hides it once initialization settles.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const RootGestureView = withUniwind(GestureHandlerRootView);

export default function RootLayout() {
  return (
    <RootGestureView className="flex-1">
      <KeyboardProvider>
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          <QueryProvider>
            <AppBootstrapProvider>
              <AppBootstrapGate>
                <NavigationThemeProvider>
                  <AlertProvider>
                    <BottomSheetProvider>
                      <RootStack />
                    </BottomSheetProvider>
                  </AlertProvider>
                </NavigationThemeProvider>
              </AppBootstrapGate>
            </AppBootstrapProvider>
          </QueryProvider>
        </HeroUINativeProvider>
      </KeyboardProvider>
    </RootGestureView>
  );
}

function RootStack() {
  const [backgroundColor, foregroundColor, constantBlack, constantWhite] = useThemeColor([
    'background',
    'foreground',
    'constant-black',
    'constant-white',
  ]);

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: isIOS ? undefined : { backgroundColor },
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="oauth/authorize"
        options={{
          headerStyle: { backgroundColor },
          headerTransparent: false,
          presentation: 'modal',
        }}
      />
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
          // The viewer runs the image full-bleed, so its chrome sits on the
          // photo rather than on a themed surface: black behind, white on top,
          // in both themes. `PaintingViewerChrome` paints the same pair.
          contentStyle: { backgroundColor: constantBlack },
          headerTintColor: constantWhite,
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
