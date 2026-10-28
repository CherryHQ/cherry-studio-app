import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { useRouter } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePaneChrome } from '@/frontend/appShell/layout';

import SidebarExpandIcon from '../../icons/SidebarExpandIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import type { RouteHeaderRootAction } from './RouteHeader.types';
import { useRouteHeaderRootAction } from './RouteHeaderProvider';
import { useOpenDrawer } from './useOpenDrawer';

const SIDEBAR_NATIVE_ICON = require('@/assets/header-toolbar/sidebar.png');

/** Resolves child screens to back and route roots to their declared action. */
export function useRouteHeaderLeadingKind(): RouteHeaderRootAction {
  const rootAction = useRouteHeaderRootAction();
  const isStackChild = useNavigationState((state) => state.index > 0);

  return (rootAction === 'drawer' || rootAction === 'none') && isStackChild ? 'back' : rootAction;
}

/** The header's leading action, or undefined when the route root leads with nothing. */
export function useRouteHeaderLeadingAction(onBack?: () => void): HeaderToolbarAction | undefined {
  const { t } = useTranslation();
  const router = useRouter();
  const openDrawer = useOpenDrawer();
  const pane = usePaneChrome();
  const routeKind = useRouteHeaderLeadingKind();
  // A pane is not a stack screen: it leads with its own exit unless the page declares a back step.
  const action = pane ? 'back' : routeKind;
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

  const routeAction = useMemo<HeaderToolbarAction>(
    () =>
      action === 'drawer'
        ? {
            accessibilityLabel: t('navigation.openMenu'),
            icon: SidebarExpandIcon,
            key: 'route-leading',
            nativeIcon: SIDEBAR_NATIVE_ICON,
            onPress: openDrawer,
            testID: 'main-header-open-sidebar',
            type: 'icon',
          }
        : action === 'close'
          ? {
              accessibilityLabel: t('common.close'),
              icon: XIcon,
              key: 'route-leading',
              onPress: goBack,
              testID: 'route-header-close',
              type: 'icon',
            }
          : {
              accessibilityLabel: t('navigation.back'),
              icon: ArrowLeftIcon,
              key: 'route-leading',
              onPress: goBack,
              testID: 'route-header-back',
              type: 'icon',
            },
    [action, goBack, openDrawer, t],
  );

  if (pane && !onBack) return pane.leadingAction;
  // A page that intercepts back keeps it even at a root that otherwise leads with nothing.
  return routeKind === 'none' && !onBack ? undefined : routeAction;
}
