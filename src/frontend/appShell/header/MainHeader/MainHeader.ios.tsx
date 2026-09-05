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
