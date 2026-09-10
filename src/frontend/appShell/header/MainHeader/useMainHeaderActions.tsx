import { useTranslation } from 'react-i18next';

import NewConversationIcon from '../../icons/NewConversationIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';
import { useMainHeaderAgent } from './MainHeaderAgentButton';

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions() {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const { agent, currentAgentId, openNewSession } = useMainHeaderAgent();
  const rightActions: HeaderToolbarAction[] = [
    {
      accessibilityLabel: t('navigation.newChat'),
      icon: NewConversationIcon,
      key: 'new-chat',
      onPress: openNewSession,
      testID: 'main-header-new-chat',
      type: 'icon',
    },
  ];

  return { agent, currentAgentId, leadingAction, rightActions };
}
