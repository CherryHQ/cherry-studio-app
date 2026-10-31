import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { useRouter } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePaneChrome } from '@/frontend/appShell/layout';
import { type SidebarToggle, useSidebarToggle } from '@/frontend/appShell/sidebar/toggle';

import SidebarExpandIcon from '../../icons/SidebarExpandIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import type { RouteHeaderRootAction } from './RouteHeader.types';
import { useRouteHeaderRootAction } from './RouteHeaderProvider';
import { useOpenDrawer } from './useOpenDrawer';

/** Resolves child screens to back and route roots to their declared action. */
function useRouteHeaderLeadingKind(): RouteHeaderRootAction {
  const rootAction = useRouteHeaderRootAction();
  const isStackChild = useNavigationState((state) => state.index > 0);

  return rootAction === 'drawer' && isStackChild ? 'back' : rootAction;
}

/** The header's leading action, or undefined when the route root leads with nothing. */
export function useRouteHeaderLeadingAction(onBack?: () => void): HeaderToolbarAction | undefined {
  const { t } = useTranslation();
  const router = useRouter();
  const openDrawer = useOpenDrawer();
  const sidebar = useSidebarToggle();
  const pane = usePaneChrome();
  const routeKind = useRouteHeaderLeadingKind();
  // A pane is not a stack screen: it leads with its own exit unless the page declares a back step.
  // A page that intercepts back keeps it even at a root that otherwise leads with the sidebar.
  const action = pane || (onBack && routeKind === 'drawer') ? 'back' : routeKind;
  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }, [onBack, router]);

  const routeAction = useMemo<HeaderToolbarAction | undefined>(
    () =>
      action === 'drawer'
        ? sidebar && {
            accessibilityLabel: t(sidebarButtons[sidebar.action].accessibilityLabel),
            icon: SidebarExpandIcon,
            key: 'route-leading',
            nativeIcon: require('@/assets/header-toolbar/sidebar.png'),
            onPress: () => toggleSidebar(sidebar, openDrawer),
            testID: sidebarButtons[sidebar.action].testID,
            type: 'icon',
          }
        : action === 'close'
          ? {
              accessibilityLabel: t('common.close'),
              icon: XIcon,
              key: 'route-leading',
              nativeIcon: require('@/assets/header-toolbar/x.png'),
              onPress: goBack,
              testID: 'route-header-close',
              type: 'icon',
            }
          : {
              accessibilityLabel: t('navigation.back'),
              icon: ArrowLeftIcon,
              key: 'route-leading',
              nativeIcon: require('@/assets/header-toolbar/arrow-left.png'),
              onPress: goBack,
              testID: 'route-header-back',
              type: 'icon',
            },
    [action, goBack, openDrawer, sidebar, t],
  );

  if (pane && !onBack) return pane.leadingAction;
  return routeAction;
}

// One button in one place at every width: it opens the overlay in a compact window and hides or
// shows the column in a wide one, keeping the same glyph as the platform's sidebar button does.
const sidebarButtons = {
  hide: { accessibilityLabel: 'navigation.hideMenu', testID: 'main-header-hide-sidebar' },
  open: { accessibilityLabel: 'navigation.openMenu', testID: 'main-header-open-sidebar' },
  show: { accessibilityLabel: 'navigation.showMenu', testID: 'main-header-show-sidebar' },
} as const;

function toggleSidebar(sidebar: SidebarToggle, openDrawer: () => void) {
  if (sidebar.action === 'open') openDrawer();
  else sidebar.setCollapsed(sidebar.action === 'hide');
}
