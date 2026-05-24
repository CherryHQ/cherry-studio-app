import { Stack, useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-uniwind';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderIconButton } from '../components/HeaderIconButton';
import type { HeaderToolbarAction } from './BackHeader.types';

export type BackHeaderProps = {
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
};

function renderAndroidHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden || !action.androidIcon) {
    return null;
  }

  const AndroidIcon = action.androidIcon;

  return (
    <HeaderIconButton
      accessibilityLabel={action.accessibilityLabel ?? ''}
      disabled={action.disabled}
      key={action.key}
      onPress={action.onPress}
    >
      <AndroidIcon className="size-6 text-foreground" strokeWidth={2} />
    </HeaderIconButton>
  );
}

export function BackHeader({ onBack, rightActions, title = '' }: BackHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  }, [onBack, router]);

  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft: () => (
        <HeaderIconButton accessibilityLabel={t('navigation.back')} onPress={goBack}>
          <ChevronLeftIcon className="size-6 text-foreground" strokeWidth={2} />
        </HeaderIconButton>
      ),
      ...(rightActions && rightActions.length > 0
        ? { headerRight: () => rightActions.map((action) => renderAndroidHeaderAction(action)) }
        : null),
      title,
    }),
    [goBack, rightActions, t, title],
  );

  return <Stack.Screen options={options} />;
}
