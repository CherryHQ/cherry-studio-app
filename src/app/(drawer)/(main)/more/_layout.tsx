import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { getRootHeaderStyle } from '@/frontend/appShell/navigation';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function MoreStackLayout() {
  const [backgroundColor, foregroundColor] = useThemeColor(['background', 'foreground']);

  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerStyle: getRootHeaderStyle(backgroundColor),
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    />
  );
}
