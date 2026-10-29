import { useTranslation } from 'react-i18next';

import { useSidebarToggle } from '@/frontend/appShell/sidebar/toggle';

import NewConversationIcon from '../../icons/NewConversationIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';

const NEW_CHAT_NATIVE_ICON = require('@/assets/header-toolbar/new-chat.png');

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions(
  openNewSession: () => void,
  actions: readonly HeaderToolbarAction[] = [],
) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  // A sidebar on screen beside the chat already offers a new chat; the header carries it while the
  // sidebar waits behind its button.
  const sidebarAction = useSidebarToggle()?.action;
  const isSidebarHidden = sidebarAction === 'open' || sidebarAction === 'show';
  const rightActions: HeaderToolbarAction[] = isSidebarHidden
    ? [
        ...actions,
        {
          accessibilityLabel: t('navigation.newChat'),
          icon: NewConversationIcon,
          key: 'new-chat',
          nativeIcon: NEW_CHAT_NATIVE_ICON,
          onPress: openNewSession,
          testID: 'main-header-new-chat',
          type: 'icon',
        },
      ]
    : [...actions];

  return { leadingAction, rightActions };
}
