import { Stack } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';
import { isIOS, isLiquidGlassAvailable } from '@/config/constants';

import { DrawerProvider } from './context/DrawerProvider';

export function DrawerRoot() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);

  return (
    <DrawerProvider>
      <Stack
        screenOptions={{
          contentStyle: {
            backgroundColor,
          },
          headerShadowVisible: isIOS ? undefined : false,
          headerStyle: isIOS
            ? undefined
            : {
                backgroundColor,
              },
          headerTransparent: isLiquidGlassAvailable,
          headerTintColor: foregroundColor,
        }}
      >
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetCornerRadius: 24,
            sheetGrabberVisible: true,
            sheetInitialDetentIndex: 0,
          }}
        />
        <Stack.Screen
          name="model-picker"
          options={{
            headerShown: false,
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetCornerRadius: 24,
            sheetGrabberVisible: true,
            sheetInitialDetentIndex: 0,
          }}
        />
      </Stack>
    </DrawerProvider>
  );
}
