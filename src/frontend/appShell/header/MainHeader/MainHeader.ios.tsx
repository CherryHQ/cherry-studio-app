import { Stack, useIsPreview } from 'expo-router';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { headerScreenOptions } from '../headerScreenOptions';
import { MainHeaderAgentButton } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

export function MainHeader() {
  const isPreview = useIsPreview();
  const { agent, currentAgentId, leadingAction, rightActions } = useMainHeaderActions();
  const { agentPickerSheet, openAgentPicker } = useMainHeaderAgentPicker(currentAgentId);

  if (isPreview) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...headerScreenOptions,
          title: '',
          headerTransparent: true,
          unstable_nativeProps: {
            headerConfig: {
              // Uniwind owns the window appearance. Native-stack's light/dark
              // override cannot update the visible iOS header dynamically.
              experimental_userInterfaceStyle: 'unspecified',
            },
          },
        }}
      />
      {agent ? (
        <Stack.Title asChild>
          <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} />
        </Stack.Title>
      ) : null}
      <HeaderActionGroup actions={[leadingAction]} placement="left" />
      <HeaderActionGroup actions={rightActions} placement="right" />
      {agentPickerSheet}
    </>
  );
}
