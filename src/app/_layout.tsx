import '../styles/global.css';

import { HeroUINativeProvider } from 'heroui-native/provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { withUniwind } from 'uniwind';

import { DrawerRoot } from '@/components/drawer';
import { NavigationThemeProvider } from '@/components/navigation';
import { DatabaseProvider, InitialDataGate, QueryProvider } from '@/data';
import { bootstrapAppRuntime } from '@/data/bootstrap/appRuntime';

const RootGestureView = withUniwind(GestureHandlerRootView);

export default function RootLayout() {
  return (
    <RootGestureView className="flex-1">
      <KeyboardProvider>
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          <QueryProvider>
            <DatabaseProvider bootstrap={bootstrapAppRuntime}>
              <InitialDataGate>
                <NavigationThemeProvider>
                  <DrawerRoot />
                </NavigationThemeProvider>
              </InitialDataGate>
            </DatabaseProvider>
          </QueryProvider>
        </HeroUINativeProvider>
      </KeyboardProvider>
    </RootGestureView>
  );
}
