import '../styles/global.css';

import { BottomSheetProvider } from '@swmansion/react-native-bottom-sheet';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { DrawerRoot } from '@/components/drawer';
import { NavigationThemeProvider } from '@/components/navigation';
import { DataProvider, InitialDataGate, QueryProvider } from '@/data';
import { bootstrapAppRuntime } from '@/data/bootstrap/appRuntime';

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
