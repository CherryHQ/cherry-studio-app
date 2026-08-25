import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { Stack, useIsPreview } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderAction } from '../components/HeaderAction';
import { headerScreenOptions } from '../headerScreenOptions';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';
import { MainHeaderAgentButton, useMainHeaderAgent } from './MainHeaderAgentButton';

export function MainHeader() {
  const isPreview = useIsPreview();
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const { agent, openAgent, openNewSession } = useMainHeaderAgent();

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
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View>
          <HeaderAction action={leadingAction} />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <HeaderAction
            action={{
              accessibilityLabel: t('navigation.newChat'),
              icon: SquarePenIcon,
              key: 'new-chat',
              onPress: openNewSession,
              type: 'icon',
            }}
          />
        </Stack.Toolbar.View>
        {agent ? (
          <Stack.Toolbar.View>
            <MainHeaderAgentButton agent={agent} onPress={openAgent} />
          </Stack.Toolbar.View>
        ) : null}
      </Stack.Toolbar>
    </>
  );
}
