import { useTranslation } from 'react-i18next';

import NewConversationIcon from '../../icons/NewConversationIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderLeadingAction } from '../RouteHeader/useRouteHeaderLeadingAction';

/** Resolves the platform-independent MainHeader action lists for both adapters. */
export function useMainHeaderActions(
  openNewSession: () => void,
  actions: readonly HeaderToolbarAction[] = [],
) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  // New chat stays in the header at every width, whatever the left column shows.
  const rightActions: HeaderToolbarAction[] = [
    ...actions,
    {
      accessibilityLabel: t('navigation.newChat'),
      icon: NewConversationIcon,
      key: 'new-chat',
      nativeIcon: 'square.and.pencil',
      onPress: openNewSession,
      testID: 'main-header-new-chat',
      type: 'icon',
    },
  ];

  return { leadingAction, rightActions };
}
