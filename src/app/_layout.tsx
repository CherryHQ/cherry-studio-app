import '../styles/global.css';

import { BottomSheetProvider } from '@swmansion/react-native-bottom-sheet';
import * as SplashScreen from 'expo-splash-screen';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { DrawerRoot } from '@/components/drawer';
import { NavigationThemeProvider } from '@/components/navigation';
import { DataProvider, InitialDataGate, QueryProvider } from '@/data';
import { bootstrapAppRuntime } from '@/data/bootstrap/appRuntime';

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
                    <DrawerRoot />
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
