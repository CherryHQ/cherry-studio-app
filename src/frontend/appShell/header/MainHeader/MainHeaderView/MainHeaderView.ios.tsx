import { Stack, useIsPreview } from 'expo-router';

import { HeaderAction } from '../../components/HeaderAction';
import { HeaderActionGroup } from '../../components/HeaderActionGroup/HeaderActionGroup';
import { headerScreenOptions } from '../../headerScreenOptions';
import { MainHeaderAgentLabel } from '../MainHeaderAgentLabel';
import { useMainHeaderActions } from '../useMainHeaderActions';
import type { MainHeaderViewProps } from './MainHeaderView.types';

export function MainHeaderView({ agent, onNewChat }: MainHeaderViewProps) {
  const isPreview = useIsPreview();
  const { leadingAction, rightActions } = useMainHeaderActions(onNewChat);
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
            <MainHeaderAgentLabel agent={agent} />
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
      <HeaderActionGroup actions={rightActions} placement="right" />
    </>
  );
}
