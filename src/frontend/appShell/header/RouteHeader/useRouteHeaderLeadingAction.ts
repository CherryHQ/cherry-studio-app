import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import MenuIcon from '@cherrystudio/app-icons/icons/menu';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { useRouter } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useRouteHeaderRootAction } from './RouteHeaderProvider';
import { useOpenDrawer } from './useOpenDrawer';

/** Resolves drawer child screens to back and route roots to their declared action. */
export function useRouteHeaderLeadingAction(onBack?: () => void): HeaderToolbarAction {
  const { t } = useTranslation();
  const router = useRouter();
  const openDrawer = useOpenDrawer();
  const rootAction = useRouteHeaderRootAction();
  const isStackChild = useNavigationState((state) => state.index > 0);
  const action = rootAction === 'drawer' && isStackChild ? 'back' : rootAction;
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
            icon: MenuIcon,
            key: 'route-leading',
            onPress: openDrawer,
            type: 'icon',
          }
        : action === 'close'
          ? {
              accessibilityLabel: t('common.close'),
              icon: XIcon,
              key: 'route-leading',
              onPress: goBack,
              type: 'icon',
            }
          : {
              accessibilityLabel: t('navigation.back'),
              icon: ArrowLeftIcon,
              key: 'route-leading',
              onPress: goBack,
              type: 'icon',
            },
    [action, goBack, openDrawer, t],
  );
}
