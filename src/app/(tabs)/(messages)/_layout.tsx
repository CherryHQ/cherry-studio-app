import { Stack } from 'expo-router';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isIOS } from '@/frontend/utils/constants';

export default function MessagesStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerShown: isIOS,
        headerTransparent: false,
        headerTintColor: foregroundColor,
      }}
    />
  );
}
