import { Stack, useIsPreview } from 'expo-router';

import { HeaderActionGroup } from '../components/HeaderActionGroup/HeaderActionGroup';
import { headerScreenOptions } from '../headerScreenOptions';
import { MainHeaderAgentButton, useMainHeaderAgent } from './MainHeaderAgentButton';
import { useMainHeaderActions } from './useMainHeaderActions';
import { useMainHeaderAgentPicker } from './useMainHeaderAgentPicker';

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
          headerTitle: renderMainHeaderAgentTitle,
          title: '',
          headerTransparent: true,
        }}
      />
      <HeaderActionGroup actions={[leadingAction]} placement="left" />
      <HeaderActionGroup actions={rightActions} placement="right" />
    </>
  );
}

function renderMainHeaderAgentTitle() {
  return <MainHeaderAgentTitle />;
}

function MainHeaderAgentTitle() {
  const { agent, currentAgentId } = useMainHeaderAgent();
  const { agentPickerSheet, openAgentPicker } = useMainHeaderAgentPicker(currentAgentId);

  return (
    <>
      {agent ? <MainHeaderAgentButton agent={agent} onPress={openAgentPicker} /> : null}
      {agentPickerSheet}
    </>
  );
}
