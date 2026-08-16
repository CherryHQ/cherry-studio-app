import { Stack } from 'expo-router';

import { messagesHeaderShown } from '@/frontend/components/navigation/messagesStackPlatform/messagesStackPlatform';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export default function MessagesStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerShown: messagesHeaderShown,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    />
  );
}
