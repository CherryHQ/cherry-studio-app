import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/appShell/header';
import { FormContentFrame, useIsFormContentConstrained } from '@/frontend/appShell/layout';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export default function AgentsStackLayout() {
  const foregroundColor = useThemeColor('foreground');
  const isFormContentConstrained = useIsFormContentConstrained();

  // The editor is a form, not a list: nothing scrolls far enough for a floating
  // header to be worth the glass, and an opaque one lets the native stack own the
  // top inset. A transparent header hands that job to `useHeaderHeight()`, which
  // reports an estimate until the native header measures itself — the content
  // would settle into place a frame after the push finished. The provider form
  // this screen is styled after already sits under an opaque header.
  const formScreen = { headerTransparent: false };

  // Every screen here keeps the ordinary page background, which the grouped
  // cards of both the list and the editor sit on, as in settings.
  return (
    <Stack
      screenLayout={FormContentFrame}
      screenOptions={{
        ...headerScreenOptions,
        // Wide-window search is a content row; the header must reserve its own space.
        headerTransparent: isLiquidGlassAvailable && !isFormContentConstrained,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        // One editor per Agent, so a repeated tap reuses it instead of stacking a copy.
        getId={({ params }) => getSingleRouteParam(params?.agentId)}
        name="[agentId]/edit"
        options={formScreen}
      />
      <Stack.Screen name="new" options={formScreen} />
    </Stack>
  );
}
