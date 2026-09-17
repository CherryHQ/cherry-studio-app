import { Stack, useIsPreview } from 'expo-router';

import { HeaderAction } from '../components/HeaderAction';
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
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View>
          <HeaderAction action={leadingAction} />
        </Stack.Toolbar.View>
        <Stack.Toolbar.Spacer hidden={!agent} width={4} />
        {agent ? (
          <Stack.Toolbar.View>
            <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} />
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
      <HeaderActionGroup actions={rightActions} placement="right" />
      {agentPickerSheet}
    </>
  );
}
