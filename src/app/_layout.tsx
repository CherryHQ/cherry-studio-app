import '../frontend/styles/global.css';
import '@/bootstrap/preboot/abortSignal';
import '@/bootstrap/preboot/blob';
import '@/bootstrap/preboot/webCrypto';
import { BottomSheetProvider } from '@swmansion/react-native-bottom-sheet';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider } from 'heroui-native/provider';
import type { PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { AppBootstrapGate, AppBootstrapProvider, useAppBootstrapState } from '@/bootstrap';
import { reportStartupCoverPresented } from '@/bootstrap/runtime/startupCoverHandoff';
import { AlertProvider } from '@/frontend/components/AlertProvider';
import { NavigationThemeProvider } from '@/frontend/components/navigation';
import {
  getRootHeaderStyle,
  getTransparentHeaderStyle,
  paintingViewerHeaderShown,
} from '@/frontend/components/navigation/rootStackPlatform/rootStackPlatform';
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
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          <QueryProvider>
            <AppBootstrapProvider>
              <BootstrapStartupCoordinator>
                <AppBootstrapGate>
                  <StartupRouteReadyReporter>
                    <NavigationThemeProvider>
                      <AlertProvider>
                        <BottomSheetProvider>
                          <RootStack />
                        </BottomSheetProvider>
                      </AlertProvider>
                    </NavigationThemeProvider>
                  </StartupRouteReadyReporter>
                </AppBootstrapGate>
              </BootstrapStartupCoordinator>
            </AppBootstrapProvider>
          </QueryProvider>
        </HeroUINativeProvider>
      </KeyboardProvider>
    </RootGestureView>
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
        headerShadowVisible: false,
        headerStyle: getRootHeaderStyle(backgroundColor),
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
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
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {/* Settings is a sheet, not a drawer scene: it is a detour out of whatever
          you were doing rather than a place you navigate to, and dismissing it
          should put you back exactly where you were. Its own nested stack draws
          the headers, so this level shows none.
          `modal`, not `formSheet`, even though iOS presents both as a page
          sheet: with `formSheet` the sheet's content view comes up offset by
          the height of its own first child, which leaves a full-height child
          (this screen's scroll view) entirely off screen. */}
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen
        name="paintings/index"
        options={{
          contentStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
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
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: getTransparentHeaderStyle(),
          headerTransparent: isLiquidGlassAvailable,
        }}
      />
    </Stack>
  );
}
