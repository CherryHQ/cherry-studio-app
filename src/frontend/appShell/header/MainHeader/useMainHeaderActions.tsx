import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';
import { useMainHeaderAgent } from './MainHeaderAgentButton';

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions() {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const { agent, currentAgentId, openAgentHistory, openNewSession } = useMainHeaderAgent();
  const rightActions: HeaderToolbarAction[] = [
    {
      accessibilityLabel: t('navigation.newChat'),
      icon: SquarePenIcon,
      key: 'new-chat',
      onPress: openNewSession,
      type: 'icon',
    },
  ];

  if (currentAgentId) {
    rightActions.push({
      accessibilityLabel: t('agent.actions.viewSessions'),
      icon: ClockIcon,
      key: 'agent-history',
      onPress: openAgentHistory,
      type: 'icon',
    });
  }

  return { agent, currentAgentId, leadingAction, rightActions };
}
