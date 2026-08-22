import { ChevronLeftIcon } from '@cherrystudio/app-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderChrome } from '../components/HeaderChrome';
import type { BackHeaderProps, HeaderToolbarAction } from './BackHeader.types';

export function BackHeader({
  leftActions,
  onBack,
  rightActions,
  title = '',
  titleElement,
}: BackHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  }, [onBack, router]);
  const defaultLeftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('navigation.back'),
        icon: ChevronLeftIcon,
        key: 'back',
        onPress: goBack,
        type: 'icon',
      },
    ],
    [goBack, t],
  );

  return (
    <HeaderChrome
      leftActions={leftActions && leftActions.length > 0 ? leftActions : defaultLeftActions}
      rightActions={rightActions}
      title={title}
      titleElement={titleElement}
    />
  );
}

export type { BackHeaderProps, HeaderToolbarAction } from './BackHeader.types';
