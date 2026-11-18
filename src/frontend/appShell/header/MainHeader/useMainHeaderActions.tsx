import { useTranslation } from 'react-i18next';

import NewConversationIcon from '../../icons/NewConversationIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions(
  openNewSession?: () => void,
  actions: readonly HeaderToolbarAction[] = [],
) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  // Readers have no creation action; interactive chats retain it at every width.
  const rightActions: HeaderToolbarAction[] = [
    ...actions,
    ...(openNewSession
      ? [
          {
            accessibilityLabel: t('navigation.newChat'),
            icon: NewConversationIcon,
            key: 'new-chat',
            nativeIcon: require('@/assets/header-toolbar/new-chat.png'),
            onPress: openNewSession,
            testID: 'main-header-new-chat',
            type: 'icon' as const,
          },
        ]
      : []),
  ];

  return { leadingAction, rightActions };
}
