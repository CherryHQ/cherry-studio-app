import { Stack, useIsPreview } from 'expo-router';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { headerScreenOptions } from '../headerScreenOptions';
import { useMainHeaderActions } from './useMainHeaderActions';

export function MainHeader() {
  const isPreview = useIsPreview();
  const { leadingAction, rightActions } = useMainHeaderActions();

  if (isPreview) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...headerScreenOptions,
          headerTitle: '',
          title: '',
          headerTransparent: true,
        }}
      />
      <HeaderActionGroup actions={[leadingAction]} placement="left" />
      <HeaderActionGroup actions={rightActions} placement="right" />
    </>
  );
}
