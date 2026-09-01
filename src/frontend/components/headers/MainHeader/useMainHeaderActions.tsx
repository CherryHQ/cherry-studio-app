import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';
import { MainHeaderAgentButton, useMainHeaderAgent } from './MainHeaderAgentButton';

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions() {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const { agent, openAgent, openNewSession } = useMainHeaderAgent();
  const rightActions: HeaderToolbarAction[] = [
    {
      accessibilityLabel: t('navigation.newChat'),
      icon: SquarePenIcon,
      key: 'new-chat',
      onPress: openNewSession,
      type: 'icon',
    },
  ];

  if (agent) {
    rightActions.push({
      element: <MainHeaderAgentButton agent={agent} onPress={openAgent} />,
      key: 'current-agent',
      type: 'custom',
    });
  }

  return { leadingAction, rightActions };
}
