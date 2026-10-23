import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { useRouter } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import SidebarExpandIcon from '../../icons/SidebarExpandIcon';
import type { HeaderToolbarAction } from '../components/HeaderAction';
import type { RouteHeaderRootAction } from './RouteHeader.types';
import { useRouteHeaderRootAction } from './RouteHeaderProvider';
import { useOpenDrawer } from './useOpenDrawer';

/** Resolves drawer child screens to back and route roots to their declared action. */
export function useRouteHeaderLeadingKind(): RouteHeaderRootAction {
  const rootAction = useRouteHeaderRootAction();
  const isStackChild = useNavigationState((state) => state.index > 0);

  return rootAction === 'drawer' && isStackChild ? 'back' : rootAction;
}

export function useRouteHeaderLeadingAction(onBack?: () => void): HeaderToolbarAction {
  const { t } = useTranslation();
  const router = useRouter();
  const openDrawer = useOpenDrawer();
  const action = useRouteHeaderLeadingKind();
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

  return useMemo<HeaderToolbarAction>(
    () =>
      action === 'drawer'
        ? {
            accessibilityLabel: t('navigation.openMenu'),
            icon: SidebarExpandIcon,
            key: 'route-leading',
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
}
