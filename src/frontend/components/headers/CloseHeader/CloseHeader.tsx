import { XIcon } from '@cherrystudio/app-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { HeaderChrome } from '../components/HeaderChrome';
import type { CloseHeaderProps } from './CloseHeader.types';

export function CloseHeader({ onClose, rightActions, title = '' }: CloseHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const close = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }

    router.back();
  }, [onClose, router]);
  const leftActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.close'),
        icon: XIcon,
        key: 'close',
        onPress: close,
        type: 'icon',
      },
    ],
    [close, t],
  );

  return (
    <HeaderChrome
      leftActions={leftActions}
      rightActions={rightActions}
      title={title}
      titleAlign="center"
    />
  );
}

export type { CloseHeaderProps } from './CloseHeader.types';
