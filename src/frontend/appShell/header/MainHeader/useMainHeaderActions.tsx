import { useTranslation } from 'react-i18next';

import { useIsSidebarPersistent } from '@/frontend/appShell/layout';

import NewConversationIcon from '../../icons/NewConversationIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import {
  useRouteHeaderLeadingAction,
  useRouteHeaderLeadingKind,
} from '../RouteHeader/useRouteHeaderLeadingAction';

const NEW_CHAT_NATIVE_ICON = require('@/assets/header-toolbar/new-chat.png');

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions(
  openNewSession: () => void,
  actions: readonly HeaderToolbarAction[] = [],
) {
  const { t } = useTranslation();
  const routeLeadingAction = useRouteHeaderLeadingAction();
  const leadingKind = useRouteHeaderLeadingKind();
  // A permanent sidebar replaces the button that opens it and already offers a new chat.
  const isSidebarPersistent = useIsSidebarPersistent();
  const leadingAction =
    isSidebarPersistent && leadingKind === 'drawer' ? undefined : routeLeadingAction;
  const rightActions: HeaderToolbarAction[] = isSidebarPersistent
    ? [...actions]
    : [
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
      ];

  return { leadingAction, rightActions };
}
