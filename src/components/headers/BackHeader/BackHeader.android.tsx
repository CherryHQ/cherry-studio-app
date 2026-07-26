import { Stack, useRouter } from 'expo-router';
import { cn } from 'heroui-native/utils';
import { ChevronLeftIcon } from 'lucide-uniwind/png';
import { Fragment, type ReactElement, type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { HeaderIconButton } from '../components/HeaderIconButton';
import type { HeaderToolbarAction } from './BackHeader.types';

export type BackHeaderProps = {
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
  titleElement?: ReactElement;
};

function renderAndroidHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden) {
    return null;
  }

  if (action.element) {
    return <Fragment key={action.key}>{action.element}</Fragment>;
  }

  if (action.label) {
    return (
      <Pressable
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        accessibilityRole="button"
        className={cn(
          'min-h-9 items-center justify-center rounded-full px-2 active:opacity-60',
          action.disabled && 'opacity-50',
        )}
        disabled={action.disabled}
        key={action.key}
        onPress={action.onPress}
      >
        <Text className="font-semibold text-base text-foreground">{action.label}</Text>
      </Pressable>
    );
  }

  if (!action.androidIcon) {
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

export function BackHeader({ onBack, rightActions, title = '', titleElement }: BackHeaderProps) {
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
      ...(titleElement ? { headerTitle: () => titleElement, title: '' } : { title }),
    }),
    [goBack, rightActions, t, title, titleElement],
  );

  return <Stack.Screen options={options} />;
}
