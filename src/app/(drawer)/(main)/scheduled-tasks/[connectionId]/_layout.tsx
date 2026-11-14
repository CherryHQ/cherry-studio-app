import { Stack } from 'expo-router';

import { headerScreenOptions, mainHeaderScreenOptions } from '@/frontend/appShell/header';
import { getRootHeaderStyle, getTransparentHeaderStyle } from '@/frontend/appShell/navigation';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export const unstable_settings = { initialRouteName: 'index' };

export default function ScheduledTaskConnectionLayout() {
  const [foregroundColor, backgroundColor, chatBackground] = useThemeColor([
    'foreground',
    'background',
    'chat-background',
  ]);
  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerStyle: getRootHeaderStyle(backgroundColor),
        headerTintColor: foregroundColor,
        contentStyle: { backgroundColor },
      }}
    >
      <Stack.Screen name="index" options={{ headerTransparent: false }} />
      <Stack.Screen
        name="[taskId]/[sessionId]"
        options={{
          ...mainHeaderScreenOptions,
          headerStyle: getTransparentHeaderStyle(),
          contentStyle: { backgroundColor: chatBackground },
        }}
      />
    </Stack>
  );
}
