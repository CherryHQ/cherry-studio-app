import { Stack } from 'expo-router';

import { headerScreenOptions } from '@/frontend/components/headers';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

export default function AgentsStackLayout() {
  const foregroundColor = useThemeColor('foreground');

  // The editor is a form, not a list: nothing scrolls far enough for a floating
  // header to be worth the glass, and an opaque one lets the native stack own the
  // top inset. A transparent header hands that job to `useHeaderHeight()`, which
  // reports an estimate until the native header measures itself — the content
  // would settle into place a frame after the push finished. The provider form
  // this screen is styled after already sits under an opaque header.
  const formScreen = { headerTransparent: false };

  // Every screen here keeps the ordinary page background. The editor used to be
  // a grouped-card screen, which needs the gray page for its white cards to sit
  // on; it now draws bare fields, and those need the page to stay lighter than
  // the field fill or the outlines are all that separate them.
  return (
    <Stack
      screenOptions={{
        ...headerScreenOptions,
        headerTransparent: isLiquidGlassAvailable,
        headerTintColor: foregroundColor,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[agentId]/edit" options={formScreen} />
      <Stack.Screen name="new" options={formScreen} />
    </Stack>
  );
}
