import '../frontend/styles/global.css';
import '@/bootstrap/preboot/abortSignal';
import '@/bootstrap/preboot/blob';
import '@/bootstrap/preboot/webCrypto';
import { Alert, BottomSheetProvider, Toast } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider } from 'heroui-native/provider';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { AppBootstrapGate, AppBootstrapProvider, useAppBootstrapState } from '@/bootstrap';
import { reportStartupCoverPresented } from '@/bootstrap/runtime/startupCoverHandoff';
import { APP_SEARCH_TRANSITION_DURATION_MS } from '@/frontend/components/appSearch';
import { headerScreenOptions, RouteHeaderProvider } from '@/frontend/components/headers';
import {
  getRootHeaderStyle,
  getTransparentHeaderStyle,
  NavigationThemeProvider,
  paintingViewerHeaderShown,
} from '@/frontend/components/navigation';
import { StartupCoordinator, StartupRouteReadyReporter } from '@/frontend/components/startup';
import { QueryProvider } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

// Hold the native surface until the matching React Native startup cover has
// committed its first layout.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const RootGestureView = withUniwind(GestureHandlerRootView);

export default function RootLayout() {
  return (
    <RootGestureView className="flex-1">
      <KeyboardProvider>
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false }, toast: 'disabled' }}>
          <Toast.Provider>
            <QueryProvider>
              <AppBootstrapProvider>
                <BootstrapStartupCoordinator>
                  <AppBootstrapGate>
                    <StartupRouteReadyReporter>
                      <NavigationThemeProvider>
                        <AppAlertProvider>
                          <BottomSheetProvider>
                            <RouteHeaderProvider rootAction="back">
                              <RootStack />
                            </RouteHeaderProvider>
                          </BottomSheetProvider>
                        </AppAlertProvider>
                      </NavigationThemeProvider>
                    </StartupRouteReadyReporter>
                  </AppBootstrapGate>
                </BootstrapStartupCoordinator>
              </AppBootstrapProvider>
            </QueryProvider>
          </Toast.Provider>
        </HeroUINativeProvider>
      </KeyboardProvider>
    </RootGestureView>
  );
}

function AppAlertProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();

  return (
    <Alert.Provider labels={{ cancel: t('common.cancel'), ok: t('common.ok') }}>
      {children}
    </Alert.Provider>
  );
}

function BootstrapStartupCoordinator({ children }: PropsWithChildren) {
  const bootstrapState = useAppBootstrapState();

  return (
    <StartupCoordinator
      bootstrapReady={bootstrapState.status !== 'loading'}
      onCoverPresented={reportStartupCoverPresented}
    >
      {children}
    </StartupCoordinator>
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
        ...headerScreenOptions,
        headerStyle: getRootHeaderStyle(backgroundColor),
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="library" options={{ headerShown: false }} />
      <Stack.Screen name="agents" options={{ headerShown: false }} />
      <Stack.Screen name="drawings" options={{ headerShown: false }} />
      <Stack.Screen
        name="search"
        options={{
          animation: 'fade_from_bottom',
          animationDuration: APP_SEARCH_TRANSITION_DURATION_MS,
          headerTransparent: false,
        }}
      />
      <Stack.Screen name="sessions" />
      {/* Settings owns a nested stack and draws its headers there, so the root
          stack only needs to push the page without adding another header. */}
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="paintings/index"
        options={{
          contentStyle: { backgroundColor: 'transparent' },
          headerStyle: getTransparentHeaderStyle(),
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
          headerShown: paintingViewerHeaderShown,
          headerTintColor: constantWhite,
          headerTransparent: true,
          title: '',
        }}
      />
      <Stack.Screen
        name="paintings/[paintingId]/conversation"
        options={{
          contentStyle: { backgroundColor: 'transparent' },
          headerStyle: getTransparentHeaderStyle(),
          headerTransparent: isLiquidGlassAvailable,
        }}
      />
    </Stack>
  );
}
